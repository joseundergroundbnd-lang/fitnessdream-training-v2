import * as webpush from 'web-push';
import firebaseConfig from '../../firebase-applet-config.json';
import { isAllowedPushEndpoint, sanitizePushUrlPath } from '../utils/webPushValidation';

interface FirestoreStringField {
  stringValue?: string;
}

interface FirestoreDocResponse {
  name?: string;
  fields?: Record<string, FirestoreStringField | undefined>;
}

interface FirestoreListResponse {
  documents?: FirestoreDocResponse[];
}

export interface SendPushRequestBody {
  targetType?: 'member' | 'staff' | 'all-members';
  targetMemberId?: string;
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  badgeCount?: number;
}

export interface SendPushResult {
  status: number;
  payload: {
    ok: boolean;
    configured?: boolean;
    sent?: number;
    failed?: number;
    totalTargets?: number;
    error?: string;
  };
}

interface VerifiedFirebaseCaller {
  uid: string;
  email: string;
  emailVerified: boolean;
}

interface StoredPushSub {
  docName: string;
  uid: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]{1,128}$/;

export function getPublicPushConfig(): { configured: boolean; publicKey: string | null } {
  const publicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  if (!publicKey || !privateKey) {
    return { configured: false, publicKey: null };
  }
  return { configured: true, publicKey };
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseCaller | null> {
  const apiKey = firebaseConfig.apiKey;
  if (!apiKey || !idToken || idToken.length > 4096) return null;

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user?.localId) return null;
    return {
      uid: user.localId,
      email: user.email || '',
      emailVerified: Boolean(user.emailVerified),
    };
  } catch {
    return null;
  }
}

function getFirestoreBaseUrl(): string {
  const projectId = firebaseConfig.projectId;
  const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(dbId)}/documents`;
}

function parsePushSubDoc(doc: FirestoreDocResponse): StoredPushSub | null {
  const fields = doc.fields;
  if (!fields || !doc.name) return null;
  const uid = fields.uid?.stringValue?.trim() || '';
  const endpoint = fields.endpoint?.stringValue?.trim() || '';
  const p256dh = fields.p256dh?.stringValue?.trim() || '';
  const auth = fields.auth?.stringValue?.trim() || '';

  if (!uid || !endpoint || !p256dh || !auth) return null;
  if (!isAllowedPushEndpoint(endpoint)) return null;

  return { docName: doc.name, uid, endpoint, p256dh, auth };
}

async function fetchFirestorePushSubCollection(
  relativeCollectionPath: string,
  idToken: string
): Promise<{ status: number; subs: StoredPushSub[] }> {
  const url = `${getFirestoreBaseUrl()}/${relativeCollectionPath}?pageSize=50`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json',
    },
  });
  if (res.status === 404) {
    return { status: 200, subs: [] };
  }
  if (!res.ok) {
    return { status: res.status, subs: [] };
  }
  const data = (await res.json()) as FirestoreListResponse;
  const subs = (data.documents || [])
    .map(parsePushSubDoc)
    .filter((item): item is StoredPushSub => item !== null);
  return { status: 200, subs };
}

async function fetchAllMemberPushSubscriptions(
  idToken: string
): Promise<{ status: number; subs: StoredPushSub[] }> {
  const membersUrl = `${getFirestoreBaseUrl()}/members?pageSize=100`;
  const res = await fetch(membersUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    return { status: res.status, subs: [] };
  }
  const data = (await res.json()) as FirestoreListResponse;
  const memberIds = (data.documents || [])
    .map((d) => d.name?.split('/').pop() || '')
    .filter((id) => VALID_ID_REGEX.test(id));

  const collected: StoredPushSub[] = [];
  const batchSize = 10;
  for (let i = 0; i < memberIds.length; i += batchSize) {
    const slice = memberIds.slice(i, i + batchSize);
    const results = await Promise.all(
      slice.map((memberId) =>
        fetchFirestorePushSubCollection(`members/${encodeURIComponent(memberId)}/pushSubscriptions`, idToken)
      )
    );
    for (const r of results) {
      collected.push(...r.subs);
    }
  }
  return { status: 200, subs: collected };
}

export async function handleSendPushRequest(params: {
  authHeader: string | undefined;
  body: SendPushRequestBody | undefined;
}): Promise<SendPushResult> {
  const rawAuth = params.authHeader || '';
  const idToken = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7).trim() : '';
  if (!idToken) {
    return { status: 401, payload: { ok: false, error: 'Missing Authorization Bearer token.' } };
  }

  const caller = await verifyFirebaseIdToken(idToken);
  if (!caller) {
    return { status: 401, payload: { ok: false, error: 'Invalid or expired Firebase ID token.' } };
  }
  if (!caller.emailVerified) {
    return { status: 403, payload: { ok: false, error: 'Verified Google email required.' } };
  }

  const vapidPublicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const vapidPrivateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const vapidSubject = (process.env.VAPID_SUBJECT || 'mailto:fitnessdreamsbenidorm@gmail.com').trim();

  if (!vapidPublicKey || !vapidPrivateKey) {
    return {
      status: 200,
      payload: {
        ok: false,
        configured: false,
        sent: 0,
        error: 'VAPID_NOT_CONFIGURED',
      },
    };
  }

  const body = params.body || {};
  const targetType = body.targetType;
  if (targetType !== 'member' && targetType !== 'staff' && targetType !== 'all-members') {
    return { status: 400, payload: { ok: false, error: 'Invalid targetType.' } };
  }

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 100) : '';
  const messageBody = typeof body.body === 'string' ? body.body.trim().slice(0, 240) : '';
  if (!title || !messageBody) {
    return { status: 400, payload: { ok: false, error: 'title and body are required.' } };
  }

  const safeUrl = sanitizePushUrlPath(body.url);
  const safeTag =
    typeof body.tag === 'string' && body.tag.trim()
      ? body.tag.trim().slice(0, 80)
      : `fd-push-${Date.now()}`;
  const badgeCount = Math.max(1, Math.min(99, Number(body.badgeCount ?? 1) || 1));

  let fetched: { status: number; subs: StoredPushSub[] };

  if (targetType === 'member') {
    const targetMemberId = typeof body.targetMemberId === 'string' ? body.targetMemberId.trim() : '';
    if (!VALID_ID_REGEX.test(targetMemberId)) {
      return { status: 400, payload: { ok: false, error: 'Valid targetMemberId is required.' } };
    }
    fetched = await fetchFirestorePushSubCollection(
      `members/${encodeURIComponent(targetMemberId)}/pushSubscriptions`,
      idToken
    );
  } else if (targetType === 'staff') {
    fetched = await fetchFirestorePushSubCollection('staffPushSubscriptions', idToken);
  } else {
    fetched = await fetchAllMemberPushSubscriptions(idToken);
  }

  if (fetched.status === 401 || fetched.status === 403) {
    return { status: 403, payload: { ok: false, error: 'Not authorized to push to this target.' } };
  }

  // Deduplicate by endpoint and avoid echoing back to the sender when pushing to a group
  const deduped = new Map<string, StoredPushSub>();
  for (const sub of fetched.subs) {
    if (targetType === 'all-members' && sub.uid === caller.uid) continue;
    if (!deduped.has(sub.endpoint)) {
      deduped.set(sub.endpoint, sub);
    }
  }

  const targets = Array.from(deduped.values());
  if (targets.length === 0) {
    return {
      status: 200,
      payload: { ok: true, configured: true, sent: 0, failed: 0, totalTargets: 0 },
    };
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const notificationJson = JSON.stringify({
    title,
    body: messageBody,
    url: safeUrl,
    tag: safeTag,
    badgeCount,
  });

  let sent = 0;
  let failed = 0;

  await Promise.all(
    targets.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          notificationJson,
          { TTL: 60 * 60 * 12, urgency: 'high' }
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        const statusCode =
          typeof err === 'object' && err !== null && 'statusCode' in err
            ? Number((err as { statusCode?: unknown }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          // Clean up expired subscription if caller has delete permission
          void fetch(`https://firestore.googleapis.com/v1/${sub.docName}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${idToken}` },
          }).catch(() => {});
        }
      }
    })
  );

  return {
    status: 200,
    payload: {
      ok: true,
      configured: true,
      sent,
      failed,
      totalTargets: targets.length,
    },
  };
}
