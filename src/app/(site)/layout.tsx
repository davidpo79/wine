import { Consent } from "@/components/tracking/Consent";
import { Journey } from "@/components/tracking/Journey";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const ga4 = process.env.GA4_MEASUREMENT_ID || null;
  const pixel = process.env.META_PIXEL_ID || null;
  const clarity = process.env.CLARITY_PROJECT_ID || null;
  // Google Consent Mode v2: everything denied until the visitor chooses. A stored choice is applied before GA loads.
  const consentDefaults = `
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500});
try{var m=document.cookie.match(/(?:^|; )wp_consent=([^;]*)/);if(m){var c=JSON.parse(decodeURIComponent(m[1]));gtag('consent','update',{analytics_storage:c.s?'granted':'denied',ad_storage:c.m?'granted':'denied',ad_user_data:c.m?'granted':'denied',ad_personalization:c.m?'granted':'denied'});}}catch(e){}
${ga4 ? `gtag('js',new Date());gtag('config',${JSON.stringify(ga4)});` : ""}`;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: consentDefaults }} />
      {ga4 && <script async src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4)}`} />}
      {children}
      <Journey />
      <Consent pixelId={pixel} clarityId={clarity} />
    </>
  );
}
