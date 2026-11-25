import React from 'react';

export const FITNESSDREAMS_DARK_LOGO_URL =
  '/src/assets/images/logo_fitnessdreams_dark_1795535654712.jpg';

interface BrandLogoProps {
  /** 'lockup' renders the full original FITNESSDREAMS dark-bg logo; 'mark' renders the compact dumbbell+orbital ring emblem; 'navbar' renders compact mark + original wordmark */
  variant?: 'mark' | 'navbar' | 'lockup';
  size?: number;
  className?: string;
}

/**
 * Official FitnessDreams brand identity adapted for dark matte black backgrounds:
 * silver-white dumbbell wrapped diagonally by the electric neon blue orbital ring,
 * paired with the signature FITNESSDREAMS wordmark (tall pointed blue A) & WORK YOUR DREAMS.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'mark',
  size = 40,
  className = '',
}) => {
  if (variant === 'lockup') {
    return (
      <img
        src={FITNESSDREAMS_DARK_LOGO_URL}
        alt="FitnessDreams — Work Your Dreams"
        referrerPolicy="no-referrer"
        className={`object-contain select-none mix-blend-lighten ${className}`}
      />
    );
  }

  const dumbbellSvg = (
    <svg
      width={size}
      height={Math.round(size * 0.62)}
      viewBox="0 0 130 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-hidden="true"
    >
      {/* Back upper arc of the orbital ring */}
      <path
        d="M34 34 C56 14, 96 6, 111 16"
        stroke="#00A8FF"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      {/* Left outer plates (white/silver for black background) */}
      <ellipse cx="20" cy="42" rx="8" ry="20" fill="#CBD5E1" />
      <ellipse cx="28" cy="42" rx="9" ry="24" fill="#F8FAFC" />
      <ellipse cx="36" cy="42" rx="9.5" ry="25" fill="#FFFFFF" stroke="#06080D" strokeWidth="2.5" />
      <ellipse cx="38" cy="42" rx="4.5" ry="13" fill="#06080D" />
      {/* Center bar */}
      <path
        d="M36 40 C52 42, 74 42, 92 40 L92 47 C74 49, 52 49, 36 47 Z"
        fill="#F8FAFC"
        stroke="#06080D"
        strokeWidth="1.5"
      />
      {/* Right plates */}
      <ellipse cx="94" cy="42" rx="9.5" ry="25" fill="#94A3B8" stroke="#06080D" strokeWidth="2.5" />
      <ellipse cx="92" cy="42" rx="4.5" ry="13" fill="#06080D" />
      <ellipse cx="102" cy="42" rx="9" ry="24" fill="#CBD5E1" />
      <ellipse cx="110" cy="42" rx="7.5" ry="19" fill="#64748B" />
      {/* Front sweeping electric neon blue orbital ring */}
      <path
        d="M111 16 C122 24, 98 54, 58 66 C34 73, 18 71, 20 59"
        stroke="#00A8FF"
        strokeWidth="7.5"
        strokeLinecap="round"
      />
    </svg>
  );

  if (variant === 'navbar') {
    return (
      <span className={`inline-flex items-center gap-2.5 ${className}`}>
        {dumbbellSvg}
        <span className="inline-flex items-baseline font-display font-bold text-[22px] tracking-[0.03em] leading-none">
          <span className="text-[#00A8FF]">FITNESS</span>
          <span className="text-white">DRE</span>
          <span className="text-[#00A8FF] text-[25px] leading-none -mx-[0.5px]">Λ</span>
          <span className="text-white">MS</span>
        </span>
      </span>
    );
  }

  return <span className={`inline-flex items-center ${className}`}>{dumbbellSvg}</span>;
};
