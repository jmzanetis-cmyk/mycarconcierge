/* Task #114 — MCC Verified copy module.
 *
 * English strings are taken verbatim from
 * MCC-BGC-Platform-Copy-and-Advertising_1776863828142.pdf. Do not paraphrase.
 * Pricing placeholders ($[XX]) and stat placeholders (78%) are intentionally
 * left literal until the user replaces them.
 *
 * Spanish translations (Task #115 follow-up) mirror the structure of the
 * English block one-for-one. They are professional translations, not literal
 * machine output. Placeholders ($[XX], 78%) are preserved.
 *
 * Public API (unchanged for back-compat):
 *   window.MCC_BGC_COPY            — active language copy
 *   window.MCC_BGC_COPY_EN         — English explicit
 *   window.MCC_BGC_COPY_ES         — Spanish explicit
 *   window.MCC_BGC_COPY_SET_LANG(lang)  — switch active language at runtime
 *
 * Active language is picked at load time from localStorage 'mcc_language'
 * (matches i18n.js STORAGE_KEY). Falls back to English for unsupported locales.
 */
(function (global) {
  const COPY_EN = {
    branding: {
      featureName:    'MCC Verified',
      tagline:        'Vetted Providers. Verified Trust.',
      badgeLabel:     '\u2713 Background Verified',
      compactLabel:   '\u2713 Verified',
      programName:    'MCC Verified Provider Program'
    },

    customer: {
      tooltipBadge:
        'This provider maintains current background checks on at least 90% of their customer-facing employees, verified through a nationally accredited screening service. Checks are renewed annually.',
      cardSubtitle:
        '\u2713 Background Verified \u2014 employees screened and current',
      filterLabel: 'Show only Verified Providers',
      filterDescription:
        'Verified Providers maintain current background checks on their employees, renewed every year.',

      detailHeader: 'About MCC Verified',
      detailBody: function (providerName) {
        return (providerName || 'This provider') +
          ' is an MCC Verified provider. This means at least 90% of their customer-facing team has passed a comprehensive background check through our nationally accredited screening partner. These checks are renewed annually to ensure ongoing compliance.';
      },
      detailIncluded:
        "What's included in the screening: \u2022 Criminal history search (national + county level) \u2022 Sex offender registry check \u2022 Identity verification",
      detailFooter:
        'MCC takes your safety seriously. The Verified badge gives you confidence that the people working on your vehicle have been professionally screened.',

      whyHeader: 'Why does this matter?',
      whyBody:
        "You\u2019re trusting someone with your vehicle \u2014 often at your home or workplace. MCC Verified providers have gone the extra mile to prove they\u2019re trustworthy. Background checks aren\u2019t required to join MCC, but providers who complete them earn the Verified badge, giving you an easy way to choose with confidence.",

      ccHeader: 'MCC Verified Provider',
      ccBody: function (compliant, total, lastVerified) {
        return 'Background checks current for ' + (compliant || 0) + ' of ' + (total || 0) +
          ' team members\nLast verified: ' + (lastVerified || '\u2014');
      },
      ccNotVerified:
        'This provider has not yet completed the MCC Verified program. You can still request bids from them \u2014 many great providers are in the process of getting verified.'
    },

    provider: {
      cardActive: function (pct) {
        return {
          title: 'MCC Verified \u2014 Active \u2713',
          body:  'Your team is ' + pct + '% compliant. Your Verified badge is live and visible to customers.',
          cta:   'View compliance details \u2192'
        };
      },
      cardAtRisk: function (pct, count) {
        return {
          title: 'MCC Verified \u2014 At Risk',
          body:  'Your compliance is at ' + pct + '%. You need 90% to keep your Verified badge. ' + count + ' employee(s) need attention.',
          cta:   'View details \u2192'
        };
      },
      cardInactive: function (pct) {
        return {
          title: 'MCC Verified \u2014 Inactive \u2717',
          body:  'Your compliance has dropped to ' + pct + '%. Your Verified badge has been removed from your listing. Renew expired checks to restore it.',
          cta:   'Renew now \u2192'
        };
      },
      cardNotEnrolled: {
        title: 'Get MCC Verified',
        body:  'Stand out from the competition. Background-checked providers get up to 3x more bid responses from customers.',
        cta:   'Start the verification process \u2192'
      },

      marketingHeadline: 'Earn the badge customers trust',
      marketingSubhead:
        'MCC Verified providers get more visibility, more bids, and more repeat customers. Background checks are fast, affordable, and handled right inside your dashboard.',
      valueProps: [
        { title: 'Stand out in search',
          body:  'Verified providers are highlighted in search results and recommended first to customers in your area.' },
        { title: 'Build instant trust',
          body:  '78% of vehicle owners say they\u2019re more likely to choose a provider with verified background checks.*' },
        { title: 'Simple compliance',
          body:  'Add your team, initiate checks with one click, and we handle the rest \u2014 including renewal reminders so you never lose your badge.' },
        { title: 'Affordable',
          body:  'Background checks start at $[XX] per employee, per year. A small investment that pays for itself with your first extra booking.' }
      ],
      marketingFootnote: '*Placeholder stat \u2014 replace with actual survey/data when available'
    },

    onboarding: {
      step1: {
        title: 'Get MCC Verified',
        body: 'The MCC Verified badge appears on your listing and Car Club profile when at least 90% of your customer-facing employees have a current background check on file. Checks are valid for 12 months.',
        screened: "What\u2019s screened:\nNational criminal records \u00b7 County-level records \u00b7 Sex offender registry \u00b7 Identity verification",
        cost: "What it costs:\n$[XX] per employee \u00b7 Results in 1\u20133 business days",
        need: "What you need:\nEach employee\u2019s full name, date of birth, email, and current address. You\u2019ll also need their consent (we provide the form).",
        cta: 'Continue \u2192'
      },
      step2: {
        title: 'Add your team',
        body: 'Add each customer-facing employee who will be working directly with MCC customers. Back-office staff who don\u2019t interact with customers can be excluded.',
        helper: 'Don\u2019t have everyone\u2019s info right now? You can add employees later from your provider dashboard.'
      },
      step3: {
        title: 'Employee consent',
        body: 'Background checks require each employee\u2019s written consent under the Fair Credit Reporting Act (FCRA). We\u2019ll send each employee a secure consent form via email.',
        confirm: 'By proceeding, you confirm that you have authorization to submit background checks on behalf of the listed employees.',
        cta: 'Send Consent Forms \u2192'
      },
      step4: {
        title: 'You\u2019re on your way to Verified',
        body: function (n) {
          return 'Background checks have been initiated for ' + (n || 0) + ' employees. Most results come back within 1\u20133 business days.';
        },
        next: [
          'Each employee will receive a consent form via email',
          'Once consent is confirmed and the check completes, results update automatically',
          'When 90% of your team is cleared, your Verified badge goes live',
          'You\u2019ll get an email when your badge is active'
        ],
        cta: 'Go to Dashboard \u2192'
      },
      // Static UI strings (buttons, errors, dynamic labels) used by the
      // onboarding-provider.html BGC panels.
      skipLong:        "Skip for now \u2014 I\u2019ll set this up later",
      skipShort:       'Skip for now',
      addEmployee:     '+ Add another employee',
      errorNoEmployees:'Add at least one employee, or skip for now.',
      errorIncomplete: 'Each employee needs at least a name and an email.',
      errorConsent:    'Please confirm authorization to continue.',
      errorInitiateAll:function (msg) {
        return 'We could not initiate any background checks (' + (msg || 'unknown error') + '). Please verify the details and try again, or skip for now.';
      },
      errorPartial:    function (n) {
        return ' (' + (n || 0) + ' could not be sent \u2014 you can retry from your dashboard.)';
      },
      employeeN:       function (n) { return 'Employee ' + n; },
      remove:          'Remove'
    },

    badge: {
      fullDetail: function (compliant, total) {
        return (compliant || 0) + ' of ' + (total || 0) + ' employees screened \u00b7 Renewed annually';
      },
      tooltip:
        'This provider\u2019s team is background-checked through MCC\u2019s accredited screening partner. Checks include criminal history, sex offender registry, and identity verification. Renewed annually.',
      modal: {
        header: 'What does MCC Verified mean?',
        body:   'Providers with the MCC Verified badge maintain current background checks on at least 90% of their customer-facing employees. Checks are conducted by a nationally accredited screening service and must be renewed every 12 months.',
        included: 'What\u2019s included in the screening? \u2022 National criminal history search \u2022 County-level criminal records \u2022 National sex offender registry \u2022 Identity verification',
        guarantee: 'Is this a guarantee? The MCC Verified badge indicates that a provider has completed the screening process and is maintaining compliance. It is not a guarantee of future behavior. We encourage you to use your own judgment alongside this information.',
        learnMore: 'Learn more about MCC\u2019s safety commitment \u2192'
      }
    },

    homepage: {
      customerHeader: 'Your car. Your trust. Our verification.',
      customerBody:
        'Every MCC Verified provider has passed comprehensive background screening for their team. Look for the \u2713 badge when browsing providers \u2014 it means their employees are screened, verified, and current.',
      customerCta: 'Browse Verified Providers \u2192',

      howItWorksHeader: 'Choose with confidence',
      howItWorksBody:
        'Compare bids from verified providers. The \u2713 badge means their team has been background-checked through our accredited screening partner, with checks renewed every year.',

      providerHeader: 'Verified providers book more jobs',
      providerBody:
        'The MCC Verified badge tells customers your team is background-checked and trustworthy. It\u2019s the fastest way to build credibility on the platform \u2014 and verified providers see higher bid acceptance rates and more repeat customers.',
      providerColumns: [
        { title: 'Comprehensive Screening',
          body:  'National criminal records, sex offender registry, and identity verification \u2014 handled by our accredited partner.' },
        { title: 'Always Current',
          body:  'Annual renewals keep your badge up to date. We send reminders at 60, 30, 14, and 7 days before expiration \u2014 you\u2019ll never be caught off guard.' },
        { title: 'Simple Compliance',
          body:  'Your provider dashboard shows exactly where you stand: who\u2019s verified, who\u2019s expiring, and what to do next.' }
      ],
      providerCtaNew:      'Start Your Verification \u2192',
      providerCtaExisting: 'Manage Your Team \u2192',

      trustBar:
        '\u2713 Background-checked providers \u00b7 Annual renewal required \u00b7 \u2713 90% team compliance minimum \u00b7 Nationally accredited screening'
    },

    legal: {
      consumer:
        'Background check information is provided by a third-party consumer reporting agency. My Car Concierge does not conduct background checks directly. The MCC Verified badge indicates that a provider has met the program\u2019s compliance requirements at the time of verification. It is not a guarantee, warranty, or endorsement of any provider\u2019s character, qualifications, or future conduct. My Car Concierge is not liable for the acts or omissions of any service provider. Consumers should exercise their own judgment when selecting service providers.'
    }
  };

  const COPY_ES = {
    branding: {
      featureName:    'MCC Verificado',
      tagline:        'Proveedores Aprobados. Confianza Verificada.',
      badgeLabel:     '\u2713 Antecedentes Verificados',
      compactLabel:   '\u2713 Verificado',
      programName:    'Programa de Proveedores MCC Verificados'
    },

    customer: {
      tooltipBadge:
        'Este proveedor mantiene verificaciones de antecedentes vigentes en al menos el 90% de los empleados que tratan directamente con clientes, validadas por un servicio de investigación acreditado a nivel nacional. Las verificaciones se renuevan anualmente.',
      cardSubtitle:
        '\u2713 Antecedentes Verificados \u2014 empleados investigados y al d\u00EDa',
      filterLabel: 'Mostrar solo Proveedores Verificados',
      filterDescription:
        'Los Proveedores Verificados mantienen verificaciones de antecedentes vigentes en sus empleados, renovadas cada a\u00F1o.',

      detailHeader: 'Acerca de MCC Verificado',
      detailBody: function (providerName) {
        return (providerName || 'Este proveedor') +
          ' es un proveedor MCC Verificado. Esto significa que al menos el 90% de su equipo que trata con clientes ha aprobado una verificaci\u00F3n de antecedentes integral con nuestro socio de investigaci\u00F3n acreditado a nivel nacional. Estas verificaciones se renuevan anualmente para garantizar el cumplimiento continuo.';
      },
      detailIncluded:
        'Qu\u00E9 incluye la verificaci\u00F3n: \u2022 B\u00FAsqueda de antecedentes penales (nivel nacional y de condado) \u2022 Consulta del registro de delincuentes sexuales \u2022 Verificaci\u00F3n de identidad',
      detailFooter:
        'MCC se toma su seguridad muy en serio. La insignia Verificado le da la confianza de que las personas que trabajan en su veh\u00EDculo han sido investigadas profesionalmente.',

      whyHeader: '\u00BFPor qu\u00E9 importa esto?',
      whyBody:
        'Usted le est\u00E1 confiando su veh\u00EDculo a alguien \u2014 a menudo en su casa o lugar de trabajo. Los proveedores MCC Verificados han hecho un esfuerzo adicional para demostrar que son confiables. Las verificaciones de antecedentes no son obligatorias para unirse a MCC, pero los proveedores que las completan obtienen la insignia Verificado, brind\u00E1ndole una manera f\u00E1cil de elegir con confianza.',

      ccHeader: 'Proveedor MCC Verificado',
      ccBody: function (compliant, total, lastVerified) {
        return 'Verificaciones de antecedentes vigentes para ' + (compliant || 0) + ' de ' + (total || 0) +
          ' miembros del equipo\n\u00DAltima verificaci\u00F3n: ' + (lastVerified || '\u2014');
      },
      ccNotVerified:
        'Este proveedor a\u00FAn no ha completado el programa MCC Verificado. Igualmente puede solicitarle cotizaciones \u2014 muchos excelentes proveedores est\u00E1n en proceso de verificarse.'
    },

    provider: {
      cardActive: function (pct) {
        return {
          title: 'MCC Verificado \u2014 Activo \u2713',
          body:  'Su equipo cumple al ' + pct + '%. Su insignia Verificado est\u00E1 activa y visible para los clientes.',
          cta:   'Ver detalles de cumplimiento \u2192'
        };
      },
      cardAtRisk: function (pct, count) {
        return {
          title: 'MCC Verificado \u2014 En Riesgo',
          body:  'Su cumplimiento est\u00E1 en ' + pct + '%. Necesita el 90% para conservar su insignia Verificado. ' + count + ' empleado(s) requieren atenci\u00F3n.',
          cta:   'Ver detalles \u2192'
        };
      },
      cardInactive: function (pct) {
        return {
          title: 'MCC Verificado \u2014 Inactivo \u2717',
          body:  'Su cumplimiento ha bajado al ' + pct + '%. Su insignia Verificado fue retirada de su listado. Renueve las verificaciones vencidas para restablecerla.',
          cta:   'Renovar ahora \u2192'
        };
      },
      cardNotEnrolled: {
        title: 'Obtenga MCC Verificado',
        body:  'Dist\u00EDngase de la competencia. Los proveedores con verificaci\u00F3n de antecedentes reciben hasta 3 veces m\u00E1s respuestas a sus cotizaciones.',
        cta:   'Iniciar el proceso de verificaci\u00F3n \u2192'
      },

      marketingHeadline: 'Gane la insignia en la que conf\u00EDan los clientes',
      marketingSubhead:
        'Los proveedores MCC Verificados obtienen m\u00E1s visibilidad, m\u00E1s cotizaciones y m\u00E1s clientes recurrentes. Las verificaciones de antecedentes son r\u00E1pidas, accesibles y se gestionan directamente desde su panel.',
      valueProps: [
        { title: 'Dest\u00E1quese en las b\u00FAsquedas',
          body:  'Los proveedores verificados se resaltan en los resultados de b\u00FAsqueda y se recomiendan primero a los clientes de su zona.' },
        { title: 'Genere confianza al instante',
          body:  'El 78% de los propietarios de veh\u00EDculos dicen que es m\u00E1s probable que elijan a un proveedor con verificaciones de antecedentes confirmadas.*' },
        { title: 'Cumplimiento sencillo',
          body:  'Agregue a su equipo, inicie las verificaciones con un clic y nosotros nos encargamos del resto \u2014 incluyendo recordatorios de renovaci\u00F3n para que nunca pierda su insignia.' },
        { title: 'Accesible',
          body:  'Las verificaciones de antecedentes desde $[XX] por empleado, por a\u00F1o. Una peque\u00F1a inversi\u00F3n que se paga sola con su primera reserva adicional.' }
      ],
      marketingFootnote: '*Estad\u00EDstica de marcador de posici\u00F3n \u2014 reemplazar con datos reales cuando est\u00E9n disponibles'
    },

    onboarding: {
      step1: {
        title: 'Obtenga MCC Verificado',
        body: 'La insignia MCC Verificado aparece en su listado y en su perfil de Car Club cuando al menos el 90% de sus empleados que tratan con clientes tienen una verificaci\u00F3n de antecedentes vigente. Las verificaciones son v\u00E1lidas por 12 meses.',
        screened: 'Qu\u00E9 se investiga:\nAntecedentes penales nacionales \u00B7 Antecedentes a nivel de condado \u00B7 Registro de delincuentes sexuales \u00B7 Verificaci\u00F3n de identidad',
        cost: 'Cu\u00E1nto cuesta:\n$[XX] por empleado \u00B7 Resultados en 1 a 3 d\u00EDas h\u00E1biles',
        need: 'Qu\u00E9 necesita:\nEl nombre completo, fecha de nacimiento, correo electr\u00F3nico y direcci\u00F3n actual de cada empleado. Tambi\u00E9n necesitar\u00E1 su consentimiento (le proporcionamos el formulario).',
        cta: 'Continuar \u2192'
      },
      step2: {
        title: 'Agregue a su equipo',
        body: 'Agregue a cada empleado que tratar\u00E1 directamente con clientes de MCC. El personal administrativo que no interact\u00FAa con clientes puede excluirse.',
        helper: '\u00BFNo tiene la informaci\u00F3n de todos ahora? Puede agregar empleados m\u00E1s adelante desde su panel de proveedor.'
      },
      step3: {
        title: 'Consentimiento del empleado',
        body: 'Las verificaciones de antecedentes requieren el consentimiento por escrito de cada empleado conforme a la Ley de Informe Justo de Cr\u00E9dito (FCRA). Enviaremos a cada empleado un formulario de consentimiento seguro por correo electr\u00F3nico.',
        confirm: 'Al continuar, usted confirma que cuenta con la autorizaci\u00F3n para enviar verificaciones de antecedentes en nombre de los empleados listados.',
        cta: 'Enviar Formularios de Consentimiento \u2192'
      },
      step4: {
        title: 'Est\u00E1 en camino a ser Verificado',
        body: function (n) {
          return 'Se han iniciado verificaciones de antecedentes para ' + (n || 0) + ' empleado(s). La mayor\u00EDa de los resultados llegan en 1 a 3 d\u00EDas h\u00E1biles.';
        },
        next: [
          'Cada empleado recibir\u00E1 un formulario de consentimiento por correo electr\u00F3nico',
          'Una vez confirmado el consentimiento y completada la verificaci\u00F3n, los resultados se actualizan autom\u00E1ticamente',
          'Cuando el 90% de su equipo est\u00E9 aprobado, su insignia Verificado se activa',
          'Recibir\u00E1 un correo electr\u00F3nico cuando su insignia est\u00E9 activa'
        ],
        cta: 'Ir al Panel \u2192'
      },
      skipLong:        'Omitir por ahora \u2014 lo configurar\u00E9 m\u00E1s tarde',
      skipShort:       'Omitir por ahora',
      addEmployee:     '+ Agregar otro empleado',
      errorNoEmployees:'Agregue al menos un empleado, u omita por ahora.',
      errorIncomplete: 'Cada empleado necesita al menos un nombre y un correo electr\u00F3nico.',
      errorConsent:    'Por favor confirme la autorizaci\u00F3n para continuar.',
      errorInitiateAll:function (msg) {
        return 'No pudimos iniciar ninguna verificaci\u00F3n de antecedentes (' + (msg || 'error desconocido') + '). Por favor verifique los datos e int\u00E9ntelo de nuevo, u omita por ahora.';
      },
      errorPartial:    function (n) {
        return ' (' + (n || 0) + ' no se pudo enviar \u2014 puede reintentar desde su panel.)';
      },
      employeeN:       function (n) { return 'Empleado ' + n; },
      remove:          'Eliminar'
    },

    badge: {
      fullDetail: function (compliant, total) {
        return (compliant || 0) + ' de ' + (total || 0) + ' empleados investigados \u00B7 Renovado anualmente';
      },
      tooltip:
        'El equipo de este proveedor cuenta con verificaciones de antecedentes a trav\u00E9s del socio de investigaci\u00F3n acreditado de MCC. Las verificaciones incluyen antecedentes penales, registro de delincuentes sexuales y verificaci\u00F3n de identidad. Se renuevan anualmente.',
      modal: {
        header: '\u00BFQu\u00E9 significa MCC Verificado?',
        body:   'Los proveedores con la insignia MCC Verificado mantienen verificaciones de antecedentes vigentes en al menos el 90% de sus empleados que tratan con clientes. Las verificaciones son realizadas por un servicio de investigaci\u00F3n acreditado a nivel nacional y deben renovarse cada 12 meses.',
        included: '\u00BFQu\u00E9 incluye la verificaci\u00F3n? \u2022 B\u00FAsqueda nacional de antecedentes penales \u2022 Antecedentes penales a nivel de condado \u2022 Registro nacional de delincuentes sexuales \u2022 Verificaci\u00F3n de identidad',
        guarantee: '\u00BFEs esto una garant\u00EDa? La insignia MCC Verificado indica que un proveedor ha completado el proceso de investigaci\u00F3n y mantiene el cumplimiento. No es una garant\u00EDa de comportamiento futuro. Le recomendamos usar su propio criterio junto con esta informaci\u00F3n.',
        learnMore: 'Conozca m\u00E1s sobre el compromiso de seguridad de MCC \u2192'
      }
    },

    homepage: {
      customerHeader: 'Su auto. Su confianza. Nuestra verificaci\u00F3n.',
      customerBody:
        'Cada proveedor MCC Verificado ha aprobado una investigaci\u00F3n integral de antecedentes para su equipo. Busque la insignia \u2713 al explorar proveedores \u2014 significa que sus empleados est\u00E1n investigados, verificados y al d\u00EDa.',
      customerCta: 'Explorar Proveedores Verificados \u2192',

      howItWorksHeader: 'Elija con confianza',
      howItWorksBody:
        'Compare cotizaciones de proveedores verificados. La insignia \u2713 significa que su equipo ha sido investigado a trav\u00E9s de nuestro socio de investigaci\u00F3n acreditado, con verificaciones renovadas cada a\u00F1o.',

      providerHeader: 'Los proveedores verificados consiguen m\u00E1s trabajos',
      providerBody:
        'La insignia MCC Verificado le dice a los clientes que su equipo est\u00E1 investigado y es confiable. Es la forma m\u00E1s r\u00E1pida de generar credibilidad en la plataforma \u2014 y los proveedores verificados ven mayores tasas de aceptaci\u00F3n de cotizaciones y m\u00E1s clientes recurrentes.',
      providerColumns: [
        { title: 'Investigaci\u00F3n Integral',
          body:  'Antecedentes penales nacionales, registro de delincuentes sexuales y verificaci\u00F3n de identidad \u2014 a cargo de nuestro socio acreditado.' },
        { title: 'Siempre Vigente',
          body:  'Las renovaciones anuales mantienen su insignia al d\u00EDa. Enviamos recordatorios a los 60, 30, 14 y 7 d\u00EDas antes del vencimiento \u2014 nunca le tomar\u00E1 por sorpresa.' },
        { title: 'Cumplimiento Sencillo',
          body:  'Su panel de proveedor muestra exactamente d\u00F3nde est\u00E1 parado: qui\u00E9n est\u00E1 verificado, qui\u00E9n est\u00E1 por vencer y qu\u00E9 hacer a continuaci\u00F3n.' }
      ],
      providerCtaNew:      'Inicie su Verificaci\u00F3n \u2192',
      providerCtaExisting: 'Administrar su Equipo \u2192',

      trustBar:
        '\u2713 Proveedores con verificaci\u00F3n de antecedentes \u00B7 Renovaci\u00F3n anual obligatoria \u00B7 \u2713 Cumplimiento m\u00EDnimo del 90% del equipo \u00B7 Investigaci\u00F3n acreditada a nivel nacional'
    },

    legal: {
      consumer:
        'La informaci\u00F3n de verificaci\u00F3n de antecedentes es proporcionada por una agencia de informes al consumidor externa. My Car Concierge no realiza verificaciones de antecedentes directamente. La insignia MCC Verificado indica que un proveedor cumpli\u00F3 con los requisitos del programa al momento de la verificaci\u00F3n. No constituye una garant\u00EDa ni un respaldo del car\u00E1cter, las calificaciones o la conducta futura de un proveedor. My Car Concierge no es responsable de los actos u omisiones de ning\u00FAn proveedor de servicios. Los consumidores deben ejercer su propio criterio al seleccionar proveedores de servicios.'
    }
  };

  const LANG_MAP = { en: COPY_EN, es: COPY_ES };
  const STORAGE_KEY = 'mcc_language';

  function detectLang() {
    try {
      const saved = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) || '';
      if (saved && LANG_MAP[saved]) return saved;
    } catch (e) { /* private browsing, etc. */ }
    return 'en';
  }

  function setLang(lang) {
    const next = LANG_MAP[lang] || COPY_EN;
    global.MCC_BGC_COPY = next;
    return next;
  }

  global.MCC_BGC_COPY_EN = COPY_EN;
  global.MCC_BGC_COPY_ES = COPY_ES;
  global.MCC_BGC_COPY_SET_LANG = setLang;
  global.MCC_BGC_COPY = LANG_MAP[detectLang()] || COPY_EN;
})(typeof window !== 'undefined' ? window : globalThis);
