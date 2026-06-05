import type { ReactNode } from "react";

const LOGO_SRC = "/woof-logo.png";
const COMPANY_NAME = "WOOF PETS SERVICES LLC";
const COMPANY_TAGLINE = "Dubai · TRN: 104486686900003 · +971 00 000 0000";
const COMPANY_EMAIL = "hello@woof.ae";

export function PrintCompanyHeader({ right }: { right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <img
          src={LOGO_SRC}
          alt="woof"
          className="h-14 w-14 shrink-0 print-keep-color"
        />
        <div>
          <p className="print-label text-xl font-bold">{COMPANY_NAME}</p>
          <p className="print-sans text-xs">{COMPANY_TAGLINE}</p>
          <p className="print-sans text-xs">{COMPANY_EMAIL}</p>
        </div>
      </div>
      {right ? <div className="print-sans shrink-0 text-right text-xs">{right}</div> : null}
    </div>
  );
}
