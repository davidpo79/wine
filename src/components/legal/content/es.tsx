// Spanish legal page bodies (drafts for legal review). Title and draft banner come from the wrapper.
import { SITE } from "@/lib/site";
import { OpenConsentLink } from "@/components/tracking/Consent";

export function Terms() {
  return (
    <>
      <h2>1. Quiénes somos</h2>
      <p>
        Esta tienda en línea está gestionada por {SITE.legalName}, número de identificación fiscal portugués (NIF) {SITE.nif}, con domicilio social en {SITE.address} (&quot;Wine Portugal&quot;). Contacto: {SITE.email}, WhatsApp {SITE.whatsapp}.
      </p>
      <p>Estas condiciones generales de venta se aplican a los pedidos realizados por consumidores con entrega en España (península y Baleares). [[TODO: revisión legal]]</p>
      <h2>2. Edad mínima</h2>
      <p>Está prohibida la venta de bebidas alcohólicas a menores de 18 años. Al hacer su pedido, confirma que tiene al menos 18 años. Podemos rechazar o cancelar un pedido si hay indicios de que la persona que lo realiza es menor de edad. [[TODO: revisión legal, verificación de la edad en la entrega por parte del transportista]]</p>
      <h2>3. Productos y precios</h2>
      <p>Todos los precios se indican en euros e incluyen el IVA aplicable. El envío está incluido en el precio de todas las ofertas. Las imágenes son ilustrativas; se entrega la añada indicada en la descripción del producto. [[TODO: revisión legal, tipo de IVA aplicable en el país de entrega]]</p>
      <h2>4. Pedido y celebración del contrato</h2>
      <p>La presentación de los productos en la tienda en línea no constituye una oferta vinculante. Al pulsar el botón de pago, realiza un pedido vinculante. El contrato de compraventa se celebra en el momento en que se confirma el pago. A continuación, recibirá una confirmación del pedido por correo electrónico. El idioma del contrato es el español. [[TODO: revisión legal, archivo del documento electrónico del contrato]]</p>
      <h2>5. Pago</h2>
      <p>Puede pagar con tarjeta de crédito o débito, Apple Pay o Google Pay. Los pagos los gestiona nuestro proveedor de servicios de pago, Stripe. Los datos de su tarjeta se introducen en la página segura de Stripe; nosotros no los recibimos ni los guardamos.</p>
      <h2>6. Entrega</h2>
      <p>Entregamos en la España peninsular y en las Islas Baleares. De momento no realizamos envíos a Canarias, Ceuta ni Melilla. El envío se realiza desde un almacén en Bélgica. [[TODO: transportista y plazos de entrega]] El envío está incluido en el precio. Recibirá el número de seguimiento por correo electrónico en cuanto se envíe su pedido. [[TODO: revisión legal, régimen en caso de retraso en la entrega]]</p>
      <h2>7. Derecho de desistimiento</h2>
      <p>
        Como consumidor, de acuerdo con la Directiva 2011/83/UE y el Real Decreto Legislativo 1/2007, por el que se aprueba el texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios (artículos 102 y siguientes), dispone de 14 días naturales desde la recepción de la mercancía para desistir del contrato sin necesidad de justificación. Encontrará los detalles, la información sobre el desistimiento y el modelo de formulario en{" "}
        <a href="/es/envios-devoluciones" className="underline">Envíos y devoluciones</a>. [[TODO: revisión legal, excepción al derecho de desistimiento para productos precintados que se hayan desprecintado]]
      </p>
      <h2>8. Garantía</h2>
      <p>Se aplica la garantía legal de conformidad de los productos (artículos 114 y siguientes del Real Decreto Legislativo 1/2007). Si tiene dudas o alguna reclamación, contacte con nosotros en {SITE.email} o por WhatsApp {SITE.whatsapp}. [[TODO: revisión legal]]</p>
      <h2>9. Factura</h2>
      <p>La factura se emite en formato electrónico y se envía por correo electrónico a la dirección indicada en el pedido. [[TODO: revisión legal]]</p>
      <h2>10. Ley aplicable</h2>
      <p>Se aplica la legislación portuguesa. Si realiza el pedido como consumidor, esta elección de ley solo se aplica en la medida en que no le prive de la protección que le otorgan las disposiciones imperativas de protección de los consumidores del país en el que tenga su residencia habitual. [[TODO: revisión legal, información sobre resolución alternativa de litigios de consumo]]</p>
      <p className="mt-8 font-semibold">Disfrute con responsabilidad.</p>
    </>
  );
}

export function Privacy() {
  return (
    <>
      <h2>Responsable del tratamiento</h2>
      <p>{SITE.legalName}, número de identificación fiscal portugués (NIF) {SITE.nif}, {SITE.address}. Contacto para cuestiones de protección de datos: {SITE.email}.</p>
      <h2>Qué datos tratamos y para qué</h2>
      <ul>
        <li><strong>Pedido:</strong> nombre, correo electrónico, teléfono, dirección de entrega y de facturación, mensaje de regalo. Finalidad: ejecución del contrato y obligaciones fiscales. Base jurídica: contrato y obligación legal (art. 6.1.b y c del RGPD).</li>
        <li><strong>Datos antes del pago:</strong> nombre, correo electrónico y móvil, para la entrega y para contactar con usted sobre su pedido. Solo con su consentimiento específico y voluntario: recordatorios por correo electrónico, SMS o WhatsApp. Puede darse de baja con el enlace incluido en cada mensaje. [[TODO: revisión legal]]</li>
        <li><strong>Pago:</strong> gestionado por Stripe (tarjeta, Apple Pay, Google Pay). Los datos de su tarjeta se introducen en la página segura de Stripe; nosotros no los recibimos ni los guardamos.</li>
        <li><strong>Novedades por correo electrónico:</strong> solo si lo indica al pagar. Base jurídica: consentimiento, que puede retirar en cualquier momento.</li>
        <li><strong>Medición de anuncios (Meta Pixel y Conversions API):</strong> activa desde que accede a la web; puede desactivarla en cualquier momento con «Rechazar» o en las preferencias de cookies. Enviamos a Meta datos de eventos y, en caso de compra, datos de contacto cifrados (hash SHA-256) para medir la eficacia de nuestros anuncios.</li>
        <li><strong>Estadística (Google Analytics 4):</strong> solo con su consentimiento a las cookies de estadística.</li>
        <li><strong>Medición anónima del recorrido de la visita:</strong> registramos los pasos de cada visita (páginas vistas, hasta dónde se desplaza, botones pulsados, campos del proceso de pago rellenados o con errores, errores de pago) con un identificador aleatorio que solo existe mientras la pestaña está abierta, para entender dónde falla la compra y mejorar la tienda. Nunca guardamos lo que escribe en los campos ni la dirección IP; solo el tipo de dispositivo, el navegador y el país. Si hace un pedido, el recorrido de esa visita se vincula al pedido. Se elimina a los 90 días. [[TODO: revisión legal]]</li>
        <li><strong>Opiniones:</strong> unos días después de la entrega le enviamos un único correo electrónico para pedirle su valoración. Si opina, publicamos las estrellas, el texto, el nombre que elija, el país y la fecha, solo con su consentimiento. Puede solicitar su eliminación en cualquier momento.</li>
        <li><strong>Grabaciones de sesión y mapas de calor (Microsoft Clarity):</strong> solo con su consentimiento a las cookies de estadística. Registra cómo se usa la página (movimientos, clics, desplazamiento); el texto escrito en los campos se oculta.</li>
      </ul>
      <h2>Encargados del tratamiento y destinatarios</h2>
      <p>Stripe (pagos), Railway (alojamiento), Resend o Telnyx (envío de correos electrónicos y mensajes), [[TODO: almacén y transportista en Bélgica]] (almacenamiento y entrega), Meta Platforms (hasta que lo rechace), Google y Microsoft (solo con consentimiento). [[TODO: confirmar la lista e indicar las transferencias a terceros países con sus garantías]]</p>
      <h2>Plazo de conservación</h2>
      <p>Datos de facturación: 10 años, por obligaciones fiscales de conservación. Resto de datos del pedido: [[TODO: plazo]]. Consentimientos de cookies: 6 meses.</p>
      <h2>Sus derechos</h2>
      <p>De acuerdo con el Reglamento General de Protección de Datos (RGPD) y la Ley Orgánica 3/2018 de Protección de Datos Personales y garantía de los derechos digitales, tiene derecho de acceso, rectificación, supresión, limitación del tratamiento, portabilidad y oposición. Puede retirar en cualquier momento el consentimiento que haya dado, con efectos para el futuro. Para ello, escríbanos a {SITE.email}.</p>
      <p>La autoridad de control principal competente es la autoridad portuguesa de protección de datos, CNPD (www.cnpd.pt). También puede presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD, www.aepd.es). [[TODO: revisión legal]]</p>
      <h2>Cookies</h2>
      <ul>
        <li><strong>wp_consent</strong> (necesaria, 6 meses): su elección de cookies.</li>
        <li><strong>wp_sid / wp_src</strong> (almacenamiento de sesión, se borra al cerrar la pestaña): identificador anónimo de la visita y de su origen, para contar visitas y pedidos de forma agregada. [[TODO: revisión legal]]</li>
        <li><strong>wp_utm</strong> (30 días): origen de la visita (campaña), asociado al pedido. [[TODO: revisión legal, clasificación como necesaria o de estadística]]</li>
        <li><strong>_ga, _ga_*</strong> (estadística, hasta 2 años): Google Analytics.</li>
        <li><strong>_clck, _clsk</strong> (estadística, hasta 1 año): Microsoft Clarity.</li>
        <li><strong>_fbp, _fbc</strong> (marketing, hasta 90 días): Meta Pixel.</li>
      </ul>
      <p>
        <OpenConsentLink className="font-semibold text-azulejo underline" locale="es" />
      </p>
    </>
  );
}

export function Shipping() {
  return (
    <>
      <h2>Envíos</h2>
      <ul>
        <li>Zona de entrega: España peninsular e Islas Baleares. De momento no realizamos envíos a Canarias, Ceuta ni Melilla.</li>
        <li>Envío desde nuestro almacén en Bélgica. Transportista: [[TODO: transportista]]. Recibirá el número de seguimiento por correo electrónico.</li>
        <li>Plazo de entrega: [[TODO: plazos de entrega]]</li>
        <li>Gastos de envío: incluidos en el precio de todas las ofertas.</li>
        <li>Navidad: [[TODO: fecha límite de pedido para la entrega antes de Navidad]]</li>
      </ul>
      <h2>Pedido dañado o erróneo</h2>
      <p>Si su caja llega dañada o con un producto distinto del pedido, escríbanos en un plazo de [[TODO: plazo]] días desde la entrega a {SITE.email} o por WhatsApp {SITE.whatsapp} y envíenos fotos. Sustituimos el producto o le devolvemos el importe, sin coste para usted. Sus derechos legales de garantía no se ven afectados.</p>
      <h2>Derecho de desistimiento (14 días)</h2>
      <p>Tiene derecho a desistir del presente contrato en un plazo de 14 días naturales sin necesidad de justificación. El plazo de desistimiento expirará a los 14 días naturales del día en que usted o un tercero indicado por usted, distinto del transportista, adquirió la posesión material de los bienes (Directiva 2011/83/UE; artículos 102 a 108 del Real Decreto Legislativo 1/2007, Ley General para la Defensa de los Consumidores y Usuarios).</p>
      <p>Para ejercer el derecho de desistimiento, deberá notificarnos ({SITE.legalName}, {SITE.address}, {SITE.email}) su decisión de desistir del contrato a través de una declaración inequívoca (por ejemplo, una carta enviada por correo postal o un correo electrónico). Podrá utilizar el modelo de formulario de desistimiento que figura a continuación, aunque su uso no es obligatorio. Para cumplir el plazo de desistimiento, basta con que la comunicación relativa al ejercicio de este derecho sea enviada antes de que venza el plazo correspondiente.</p>
      <p>En caso de desistimiento por su parte, le devolveremos todos los pagos recibidos de usted, incluidos los gastos de entrega (con la excepción de los gastos adicionales resultantes de la elección por su parte de una modalidad de entrega diferente a la modalidad menos costosa de entrega ordinaria que ofrezcamos), sin ninguna demora indebida y, en todo caso, a más tardar 14 días naturales a partir de la fecha en la que se nos informe de su decisión de desistir del presente contrato. Procederemos a efectuar dicho reembolso utilizando el mismo medio de pago empleado por usted para la transacción inicial. Podremos retener el reembolso hasta haber recibido los bienes, o hasta que usted haya presentado una prueba de la devolución de los mismos, según qué condición se cumpla primero.</p>
      <p>Deberá devolvernos los bienes a [[TODO: dirección de devolución]] sin ninguna demora indebida y, en cualquier caso, a más tardar en el plazo de 14 días naturales a partir de la fecha en que nos comunique su decisión de desistimiento. Deberá asumir el coste directo de devolución de los bienes. [[TODO: revisión legal, Wine Portugal puede decidir asumir este coste]] Solo será responsable de la disminución de valor de los bienes resultante de una manipulación distinta a la necesaria para establecer la naturaleza, las características y el funcionamiento de los bienes.</p>
      <p>
        <strong>Botellas abiertas:</strong> el derecho de desistimiento puede no aplicarse al suministro de bienes precintados que no sean aptos para ser devueltos por razones de protección de la salud o de higiene y que hayan sido desprecintados tras la entrega (art. 16.e de la Directiva 2011/83/UE; art. 103.e del Real Decreto Legislativo 1/2007). [[TODO: revisión legal, aplicabilidad de esta excepción al vino]]
      </p>
      <h2>Modelo de formulario de desistimiento</h2>
      <p className="rounded border border-paper-2 bg-white p-4 text-sm">
        (Solo debe cumplimentar y enviar el presente formulario si desea desistir del contrato.)<br />
        A la atención de {SITE.legalName}, {SITE.address}, {SITE.email}:<br />
        Por la presente le comunico/comunicamos (*) que desisto de/desistimos de (*) mi/nuestro (*) contrato de venta del siguiente bien: ___<br />
        Número de pedido: ___ · Pedido el (*) ___ / recibido el (*) ___<br />
        Nombre del consumidor o de los consumidores: ___<br />
        Domicilio del consumidor o de los consumidores: ___<br />
        Firma del consumidor o de los consumidores (solo si el presente formulario se presenta en papel) · Fecha: ___<br />
        (*) Táchese lo que no proceda.
      </p>
    </>
  );
}
