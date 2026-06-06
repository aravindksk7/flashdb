import React from 'react';

type ConsoleIconName =
  | 'create'
  | 'explore'
  | 'refresh'
  | 'edit'
  | 'delete'
  | 'restore'
  | 'database'
  | 'schema'
  | 'spark'
  | 'status'
  | 'warning';

interface ConsoleIconProps {
  name: ConsoleIconName;
  className?: string;
}

const icons: Record<ConsoleIconName, React.ReactNode> = {
  create: (
    <path d="M12 5v14m-7-7h14" strokeLinecap="round" strokeLinejoin="round" />
  ),
  explore: (
    <>
      <path d="M11 4a7 7 0 1 0 4.95 11.95" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="11" cy="11" r="4" />
    </>
  ),
  refresh: (
    <>
      <path d="M4 12a8 8 0 0 1 13.66-5.66L20 9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 12a8 8 0 0 1-13.66 5.66L4 15" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20v-5h5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  edit: (
    <>
      <path d="m4 20 4.5-1 10-10a1.8 1.8 0 0 0-2.5-2.5l-10 10L4 20Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m13 7 4 4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  delete: (
    <>
      <path d="M4 7h16" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 7l1 12a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8l1-12" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v5m4-5v5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  restore: (
    <>
      <path d="M4 12a8 8 0 1 0 2.34-5.66" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  schema: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <path d="M4 10h16M9 5v14M14 5v14" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  spark: (
    <path d="M4 16h4l2-6 3 10 2-4h5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  status: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4 4 19h16L12 4Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 9v4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="16" r="1" />
    </>
  )
};

export const ConsoleIcon: React.FC<ConsoleIconProps> = ({ name, className }) => {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  );
};

export default ConsoleIcon;