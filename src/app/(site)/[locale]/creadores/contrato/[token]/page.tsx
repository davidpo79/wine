import { notFound } from "next/navigation";
import { contractByToken } from "@/lib/creator-contract-service";
import { contractBlocks, signerOf, termsOf } from "@/lib/creator-contract";
import { ContractSign } from "@/components/creators/ContractSign";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contrato de colaboración | Wine Portugal", robots: { index: false, follow: false } };

/** A UGC creator reads and signs their contract (personal link sent by email and SMS from the admin). */
export default async function ContratoPage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  if (locale !== "es") notFound();
  const c = await contractByToken(token);
  if (!c || c.status === "void") notFound();
  return (
    <ContractSign
      token={token}
      id={c.id}
      email={c.email}
      signed={c.status === "signed"}
      terms={termsOf(c)}
      initial={signerOf(c)}
      blocks={contractBlocks(c, signerOf(c), c.signedAt)}
    />
  );
}
