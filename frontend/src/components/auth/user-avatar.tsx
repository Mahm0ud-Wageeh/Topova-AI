import { useEffect, useState } from "react";
import { useAvatarUrl } from "@/components/auth/avatar-store";

/**
 * The signed-in user's Google photo, falling back to gradient initials when
 * there is no photo (guests, email accounts) or the image cannot load.
 */
export function UserAvatar({
  initials,
  gradientClass,
  className,
  name,
}: {
  initials: string;
  gradientClass: string;
  className: string;
  name?: string;
}) {
  const url = useAvatarUrl();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name ? `${name}` : ""}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${className} object-cover shadow`}
      />
    );
  }
  return (
    <span
      className={`${className} grid place-items-center bg-gradient-to-br ${gradientClass} font-display font-bold text-white shadow`}
    >
      {initials}
    </span>
  );
}
