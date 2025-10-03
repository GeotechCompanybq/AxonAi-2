import Image from "next/image";
import type { SVGProps } from "react";

export function LogoImg({
  className = "",
  ...rest
}: { className?: string } & Omit<
  React.ComponentProps<typeof Image>,
  "src" | "alt" | "width" | "height"
>) {
  return (
    <Image
      src="/axon-logo.png"
      alt="AxonAI"
      width={160}
      height={42}
      className={`select-none ${className} dark:invert-0 invert-[.9]`}
      {...rest}
    />
  );
}

// Backwards-compatible placeholder if something still imports Logo as SVG
export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1 1"
      width="1"
      height="1"
      aria-hidden="true"
      {...props}
    />
  );
}

export function IconSpinner(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
      className={`animate-spin ${props.className || ""}`}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
