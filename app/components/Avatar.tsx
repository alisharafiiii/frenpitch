"use client";

import ui from "@/app/styles/ui.module.css";

/** avatar with real tg pfp when available, gradient initials otherwise.
 *  the img quietly hides itself if the photo 404s. */
export function Avatar({
  photoUrl,
  initial,
  gradient,
  size,
  fontSize,
  className = "",
}: {
  photoUrl?: string;
  initial: string;
  gradient: [string, string];
  size: number;
  fontSize: number;
  className?: string;
}) {
  return (
    <span
      className={`${ui.avatar} ${className}`}
      style={{
        width: size,
        height: size,
        fontSize,
        background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {initial}
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
    </span>
  );
}
