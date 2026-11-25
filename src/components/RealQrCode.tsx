import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface RealQrCodeProps {
  value: string;
  size?: number;
  fgColor?: string;
  bgColor?: string;
  label?: string;
  className?: string;
}

/**
 * Generates a real, ISO-18004 scannable QR code as a crisp data-URL PNG
 * so any mobile camera or Turnstile Scanner (jsQR) reads it reliably in <0.3s.
 */
export const RealQrCode: React.FC<RealQrCodeProps> = ({
  value,
  size = 192,
  fgColor = '#06080D',
  bgColor = '#FFFFFF',
  label,
  className = '',
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value || 'FD:MEMBER:DEMO', {
      width: size * 2,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: fgColor,
        light: bgColor,
      },
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [value, size, fgColor, bgColor]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-lg bg-slate-100 animate-pulse ${className}`}
        aria-label={label ?? `Código QR ${value}`}
      />
    );
  }

  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt={label ?? `Código QR ${value}`}
      className={`block select-none ${className}`}
    />
  );
};
