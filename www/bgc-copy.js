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

  // ---------------------------------------------------------------------------
  // French (fr)
  // ---------------------------------------------------------------------------
  const COPY_FR = {
    branding: {
      featureName:    'MCC Vérifié',
      tagline:        'Prestataires Approuvés. Confiance Vérifiée.',
      badgeLabel:     '\u2713 Antécédents Vérifiés',
      compactLabel:   '\u2713 Vérifié',
      programName:    'Programme de Prestataires MCC Vérifiés'
    },
    customer: {
      tooltipBadge:
        'Ce prestataire maintient des vérifications d’antécédents à jour pour au moins 90 % de ses employés en contact avec les clients, validées par un service de filtrage agréé au niveau national. Les vérifications sont renouvelées chaque année.',
      cardSubtitle:
        '\u2713 Antécédents Vérifiés — employés filtrés et à jour',
      filterLabel: 'Afficher uniquement les Prestataires Vérifiés',
      filterDescription:
        'Les Prestataires Vérifiés maintiennent des vérifications d’antécédents à jour pour leurs employés, renouvelées chaque année.',

      detailHeader: 'À propos de MCC Vérifié',
      detailBody: function (providerName) {
        return (providerName || 'Ce prestataire') +
          ' est un prestataire MCC Vérifié. Cela signifie qu’au moins 90 % de son équipe en contact avec les clients a passé une vérification d’antécédents complète auprès de notre partenaire de filtrage agréé au niveau national. Ces vérifications sont renouvelées chaque année pour garantir le respect continu des exigences.';
      },
      detailIncluded:
        'Ce qui est inclus dans la vérification : • Recherche d’antécédents criminels (national + comté) • Consultation du registre des délinquants sexuels • Vérification d’identité',
      detailFooter:
        'MCC prend votre sécurité au sérieux. Le badge Vérifié vous donne l’assurance que les personnes qui travaillent sur votre véhicule ont été filtrées de manière professionnelle.',

      whyHeader: 'Pourquoi est-ce important ?',
      whyBody:
        'Vous confiez votre véhicule à quelqu’un — souvent chez vous ou sur votre lieu de travail. Les prestataires MCC Vérifiés ont fait l’effort supplémentaire de prouver leur fiabilité. Les vérifications d’antécédents ne sont pas obligatoires pour rejoindre MCC, mais les prestataires qui les complètent obtiennent le badge Vérifié, vous offrant un moyen simple de choisir en toute confiance.',

      ccHeader: 'Prestataire MCC Vérifié',
      ccBody: function (compliant, total, lastVerified) {
        return 'Vérifications d’antécédents à jour pour ' + (compliant || 0) + ' sur ' + (total || 0) +
          ' membres de l’équipe\nDernière vérification : ' + (lastVerified || '\u2014');
      },
      ccNotVerified:
        'Ce prestataire n’a pas encore complété le programme MCC Vérifié. Vous pouvez toujours lui demander des devis — de nombreux excellents prestataires sont en cours de vérification.'
    },
    provider: {
      cardActive: function (pct) {
        return {
          title: 'MCC Vérifié — Actif \u2713',
          body:  'Votre équipe est conforme à ' + pct + ' %. Votre badge Vérifié est en ligne et visible par les clients.',
          cta:   'Voir les détails de conformité \u2192'
        };
      },
      cardAtRisk: function (pct, count) {
        return {
          title: 'MCC Vérifié — À Risque',
          body:  'Votre conformité est à ' + pct + ' %. Vous avez besoin de 90 % pour conserver votre badge Vérifié. ' + count + ' employé(s) nécessite(nt) une attention.',
          cta:   'Voir les détails \u2192'
        };
      },
      cardInactive: function (pct) {
        return {
          title: 'MCC Vérifié — Inactif \u2717',
          body:  'Votre conformité est tombée à ' + pct + ' %. Votre badge Vérifié a été retiré de votre annonce. Renouvelez les vérifications expirées pour le restaurer.',
          cta:   'Renouveler maintenant \u2192'
        };
      },
      cardNotEnrolled: {
        title: 'Devenez MCC Vérifié',
        body:  'Démarquez-vous de la concurrence. Les prestataires avec antécédents vérifiés reçoivent jusqu’à 3 fois plus de réponses à leurs offres.',
        cta:   'Démarrer le processus de vérification \u2192'
      },
      marketingHeadline: 'Obtenez le badge auquel les clients font confiance',
      marketingSubhead:
        'Les prestataires MCC Vérifiés bénéficient de plus de visibilité, de plus d’offres et de plus de clients fidèles. Les vérifications d’antécédents sont rapides, abordables et gérées directement depuis votre tableau de bord.',
      valueProps: [
        { title: 'Démarquez-vous dans la recherche',
          body:  'Les prestataires Vérifiés sont mis en avant dans les résultats de recherche et recommandés en priorité aux clients de votre région.' },
        { title: 'Inspirez confiance instantanément',
          body:  '78% des propriétaires de véhicules déclarent qu’ils sont plus susceptibles de choisir un prestataire avec des vérifications d’antécédents.*' },
        { title: 'Conformité simple',
          body:  'Ajoutez votre équipe, lancez les vérifications en un clic, et nous nous occupons du reste — y compris des rappels de renouvellement pour que vous ne perdiez jamais votre badge.' },
        { title: 'Abordable',
          body:  'Les vérifications d’antécédents commencent à $[XX] par employé et par an. Un petit investissement qui se rentabilise dès votre première réservation supplémentaire.' }
      ],
      marketingFootnote: '*Statistique provisoire — à remplacer par une donnée réelle lorsqu’elle sera disponible'
    },
    onboarding: {
      step1: {
        title: 'Devenez MCC Vérifié',
        body: 'Le badge MCC Vérifié apparaît sur votre annonce et votre profil Car Club lorsqu’au moins 90 % de vos employés en contact avec les clients ont une vérification d’antécédents à jour. Les vérifications sont valides 12 mois.',
        screened: 'Ce qui est filtré :\nCasier judiciaire national · Casier au niveau du comté · Registre des délinquants sexuels · Vérification d’identité',
        cost: 'Combien ça coûte :\n$[XX] par employé · Résultats sous 1 à 3 jours ouvrables',
        need: 'Ce dont vous avez besoin :\nLe nom complet, la date de naissance, l’e-mail et l’adresse actuelle de chaque employé. Vous aurez aussi besoin de leur consentement (nous fournissons le formulaire).',
        cta: 'Continuer \u2192'
      },
      step2: {
        title: 'Ajoutez votre équipe',
        body: 'Ajoutez chaque employé en contact avec les clients qui travaillera directement avec les clients MCC. Le personnel administratif qui n’interagit pas avec les clients peut être exclu.',
        helper: 'Vous n’avez pas toutes les infos sous la main ? Vous pourrez ajouter des employés plus tard depuis votre tableau de bord prestataire.'
      },
      step3: {
        title: 'Consentement de l’employé',
        body: 'Les vérifications d’antécédents nécessitent le consentement écrit de chaque employé en vertu du Fair Credit Reporting Act (FCRA). Nous enverrons à chaque employé un formulaire de consentement sécurisé par e-mail.',
        confirm: 'En continuant, vous confirmez que vous avez l’autorisation de soumettre des vérifications d’antécédents au nom des employés listés.',
        cta: 'Envoyer les Formulaires de Consentement \u2192'
      },
      step4: {
        title: 'Vous êtes en bonne voie pour devenir Vérifié',
        body: function (n) {
          return 'Les vérifications d’antécédents ont été lancées pour ' + (n || 0) + ' employés. La plupart des résultats arrivent sous 1 à 3 jours ouvrables.';
        },
        next: [
          'Chaque employé recevra un formulaire de consentement par e-mail',
          'Une fois le consentement confirmé et la vérification terminée, les résultats se mettent à jour automatiquement',
          'Quand 90 % de votre équipe est validée, votre badge Vérifié devient actif',
          'Vous recevrez un e-mail lorsque votre badge sera actif'
        ],
        cta: 'Aller au Tableau de Bord \u2192'
      },
      skipLong:        'Passer pour l’instant — je le configurerai plus tard',
      skipShort:       'Passer pour l’instant',
      addEmployee:     '+ Ajouter un autre employé',
      errorNoEmployees:'Ajoutez au moins un employé, ou passez pour l’instant.',
      errorIncomplete: 'Chaque employé doit avoir au moins un nom et un e-mail.',
      errorConsent:    'Veuillez confirmer l’autorisation pour continuer.',
      errorInitiateAll:function (msg) {
        return 'Nous n’avons pas pu lancer les vérifications d’antécédents (' + (msg || 'erreur inconnue') + '). Veuillez vérifier les détails et réessayer, ou passez pour l’instant.';
      },
      errorPartial:    function (n) {
        return ' (' + (n || 0) + ' n’ont pas pu être envoyées — vous pouvez réessayer depuis votre tableau de bord.)';
      },
      employeeN:       function (n) { return 'Employé ' + n; },
      remove:          'Supprimer'
    },
    badge: {
      fullDetail: function (compliant, total) {
        return (compliant || 0) + ' sur ' + (total || 0) + ' employés filtrés · Renouvelé annuellement';
      },
      tooltip:
        'L’équipe de ce prestataire est filtrée par le partenaire de filtrage agréé de MCC. Les vérifications incluent l’historique criminel, le registre des délinquants sexuels et la vérification d’identité. Renouvelées annuellement.',
      modal: {
        header: 'Que signifie MCC Vérifié ?',
        body:   'Les prestataires arborant le badge MCC Vérifié maintiennent des vérifications d’antécédents à jour pour au moins 90 % de leurs employés en contact avec les clients. Les vérifications sont effectuées par un service de filtrage agréé au niveau national et doivent être renouvelées tous les 12 mois.',
        included: 'Ce qui est inclus dans la vérification ? • Recherche d’antécédents criminels nationaux • Casier judiciaire au niveau du comté • Registre national des délinquants sexuels • Vérification d’identité',
        guarantee: 'Est-ce une garantie ? Le badge MCC Vérifié indique qu’un prestataire a complété le processus de filtrage et maintient sa conformité. Il ne s’agit pas d’une garantie de comportement futur. Nous vous encourageons à utiliser votre propre jugement en complément de cette information.',
        learnMore: 'En savoir plus sur l’engagement de sécurité de MCC \u2192'
      }
    },
    homepage: {
      customerHeader: 'Votre voiture. Votre confiance. Notre vérification.',
      customerBody:
        'Chaque prestataire MCC Vérifié a passé un filtrage d’antécédents complet pour son équipe. Cherchez le badge \u2713 lorsque vous parcourez les prestataires — cela signifie que leurs employés sont filtrés, vérifiés et à jour.',
      customerCta: 'Parcourir les Prestataires Vérifiés \u2192',
      howItWorksHeader: 'Choisissez en toute confiance',
      howItWorksBody:
        'Comparez les offres des prestataires vérifiés. Le badge \u2713 signifie que leur équipe a été filtrée par notre partenaire de filtrage agréé, avec des vérifications renouvelées chaque année.',
      providerHeader: 'Les prestataires vérifiés réservent plus de missions',
      providerBody:
        'Le badge MCC Vérifié indique aux clients que votre équipe est filtrée et fiable. C’est le moyen le plus rapide de bâtir votre crédibilité sur la plateforme — et les prestataires vérifiés voient des taux d’acceptation des offres plus élevés et plus de clients fidèles.',
      providerColumns: [
        { title: 'Filtrage Complet',
          body:  'Casier judiciaire national, registre des délinquants sexuels et vérification d’identité — pris en charge par notre partenaire agréé.' },
        { title: 'Toujours À Jour',
          body:  'Les renouvellements annuels maintiennent votre badge à jour. Nous envoyons des rappels à 60, 30, 14 et 7 jours avant l’expiration — vous ne serez jamais pris au dépourvu.' },
        { title: 'Conformité Simple',
          body:  'Votre tableau de bord prestataire montre exactement où vous en êtes : qui est vérifié, qui expire et quoi faire ensuite.' }
      ],
      providerCtaNew:      'Démarrer Votre Vérification \u2192',
      providerCtaExisting: 'Gérer Votre Équipe \u2192',
      trustBar:
        '\u2713 Prestataires avec antécédents vérifiés · Renouvellement annuel obligatoire · \u2713 Conformité minimale de 90 % de l’équipe · Filtrage agréé au niveau national'
    },
    legal: {
      consumer:
        'Les informations de vérification d’antécédents sont fournies par une agence d’évaluation de la consommation tierce. My Car Concierge n’effectue pas directement de vérifications d’antécédents. Le badge MCC Vérifié indique qu’un prestataire a satisfait aux exigences de conformité du programme au moment de la vérification. Il ne constitue pas une garantie ni un avenant relatif au caractère, aux qualifications ou à la conduite future d’un prestataire. My Car Concierge n’est pas responsable des actes ou omissions de tout prestataire de services. Les consommateurs doivent exercer leur propre jugement lors du choix des prestataires.'
    }
  };

  // ---------------------------------------------------------------------------
  // Greek (el)
  // ---------------------------------------------------------------------------
  const COPY_EL = {
    branding: {
      featureName:    'MCC Πιστοποιημένος',
      tagline:        'Ελεγμένοι Πάροχοι. Πιστοποιημένη Εμπιστοσύνη.',
      badgeLabel:     '\u2713 Έλεγχος Ιστορικού Πιστοποιημένος',
      compactLabel:   '\u2713 Πιστοποιημένος',
      programName:    'Πρόγραμμα Πιστοποιημένων Παρόχων MCC'
    },
    customer: {
      tooltipBadge:
        'Αυτός ο πάροχος διατηρεί ισχύοντες ελέγχους ιστορικού για τουλάχιστον το 90% των εργαζομένων που έχουν άμεση επαφή με πελάτες, επικυρωμένους από εθνικά αναγνωρισμένη υπηρεσία ελέγχου. Οι έλεγχοι ανανεώνονται κάθε χρόνο.',
      cardSubtitle:
        '\u2713 Έλεγχος Ιστορικού Πιστοποιημένος — εργαζόμενοι ελεγμένοι και ενημερωμένοι',
      filterLabel: 'Εμφάνιση μόνο Πιστοποιημένων Παρόχων',
      filterDescription:
        'Οι Πιστοποιημένοι Πάροχοι διατηρούν ισχύοντες ελέγχους ιστορικού για τους εργαζομένους τους, οι οποίοι ανανεώνονται κάθε χρόνο.',

      detailHeader: 'Σχετικά με το MCC Πιστοποιημένος',
      detailBody: function (providerName) {
        return (providerName || 'Αυτός ο πάροχος') +
          ' είναι Πιστοποιημένος Πάροχος MCC. Αυτό σημαίνει ότι τουλάχιστον το 90% της ομάδας του που έρχεται σε επαφή με πελάτες έχει περάσει ολοκληρωμένο έλεγχο ιστορικού μέσω του εθνικά αναγνωρισμένου συνεργάτη ελέγχου μας. Οι έλεγχοι αυτοί ανανεώνονται κάθε χρόνο για τη διασφάλιση της συνεχούς συμμόρφωσης.';
      },
      detailIncluded:
        'Τι περιλαμβάνει ο έλεγχος: • Αναζήτηση ποινικού ιστορικού (εθνικό + επίπεδο νομού) • Έλεγχος μητρώου σεξουαλικών παραβατών • Επαλήθευση ταυτότητας',
      detailFooter:
        'Η MCC αντιμετωπίζει την ασφάλειά σας με σοβαρότητα. Το σήμα Πιστοποιημένος σας δίνει τη βεβαιότητα ότι οι άνθρωποι που εργάζονται στο όχημά σας έχουν ελεγχθεί επαγγελματικά.',

      whyHeader: 'Γιατί έχει σημασία αυτό;',
      whyBody:
        'Εμπιστεύεστε σε κάποιον το όχημά σας — συχνά στο σπίτι ή στον χώρο εργασίας σας. Οι Πιστοποιημένοι Πάροχοι MCC έχουν κάνει το επιπλέον βήμα να αποδείξουν ότι είναι αξιόπιστοι. Οι έλεγχοι ιστορικού δεν είναι υποχρεωτικοί για συμμετοχή στο MCC, αλλά οι πάροχοι που τους ολοκληρώνουν αποκτούν το σήμα Πιστοποιημένος, δίνοντάς σας έναν εύκολο τρόπο να επιλέξετε με σιγουριά.',

      ccHeader: 'Πιστοποιημένος Πάροχος MCC',
      ccBody: function (compliant, total, lastVerified) {
        return 'Έλεγχοι ιστορικού σε ισχύ για ' + (compliant || 0) + ' από ' + (total || 0) +
          ' μέλη της ομάδας\nΤελευταία πιστοποίηση: ' + (lastVerified || '\u2014');
      },
      ccNotVerified:
        'Αυτός ο πάροχος δεν έχει ολοκληρώσει ακόμα το πρόγραμμα MCC Πιστοποιημένος. Μπορείτε ακόμα να ζητήσετε προσφορές από αυτόν — πολλοί εξαιρετικοί πάροχοι βρίσκονται στη διαδικασία πιστοποίησης.'
    },
    provider: {
      cardActive: function (pct) {
        return {
          title: 'MCC Πιστοποιημένος — Ενεργός \u2713',
          body:  'Η ομάδα σας είναι σε συμμόρφωση κατά ' + pct + '%. Το σήμα Πιστοποιημένος είναι ενεργό και ορατό στους πελάτες.',
          cta:   'Δείτε τις λεπτομέρειες συμμόρφωσης \u2192'
        };
      },
      cardAtRisk: function (pct, count) {
        return {
          title: 'MCC Πιστοποιημένος — Σε Κίνδυνο',
          body:  'Η συμμόρφωσή σας είναι στο ' + pct + '%. Χρειάζεστε 90% για να διατηρήσετε το σήμα Πιστοποιημένος. ' + count + ' εργαζόμενος/-οι χρειάζονται προσοχή.',
          cta:   'Δείτε λεπτομέρειες \u2192'
        };
      },
      cardInactive: function (pct) {
        return {
          title: 'MCC Πιστοποιημένος — Ανενεργός \u2717',
          body:  'Η συμμόρφωσή σας έχει πέσει στο ' + pct + '%. Το σήμα Πιστοποιημένος έχει αφαιρεθεί από την καταχώρισή σας. Ανανεώστε τους ληγμένους ελέγχους για να το επαναφέρετε.',
          cta:   'Ανανέωση τώρα \u2192'
        };
      },
      cardNotEnrolled: {
        title: 'Γίνετε MCC Πιστοποιημένος',
        body:  'Ξεχωρίστε από τον ανταγωνισμό. Οι πάροχοι με ελεγμένο ιστορικό λαμβάνουν έως και 3 φορές περισσότερες απαντήσεις σε προσφορές από πελάτες.',
        cta:   'Ξεκινήστε τη διαδικασία πιστοποίησης \u2192'
      },
      marketingHeadline: 'Κερδίστε το σήμα που εμπιστεύονται οι πελάτες',
      marketingSubhead:
        'Οι Πιστοποιημένοι Πάροχοι MCC αποκτούν μεγαλύτερη προβολή, περισσότερες προσφορές και περισσότερους πελάτες που επιστρέφουν. Οι έλεγχοι ιστορικού είναι γρήγοροι, οικονομικοί και διεκπεραιώνονται απευθείας από τον πίνακα ελέγχου σας.',
      valueProps: [
        { title: 'Ξεχωρίστε στην αναζήτηση',
          body:  'Οι Πιστοποιημένοι Πάροχοι προβάλλονται πρώτοι στα αποτελέσματα αναζήτησης και προτείνονται κατά προτεραιότητα στους πελάτες της περιοχής σας.' },
        { title: 'Χτίστε άμεσα εμπιστοσύνη',
          body:  'Το 78% των ιδιοκτητών οχημάτων δηλώνει ότι είναι πιο πιθανό να επιλέξει έναν πάροχο με πιστοποιημένους ελέγχους ιστορικού.*' },
        { title: 'Απλή συμμόρφωση',
          body:  'Προσθέστε την ομάδα σας, ξεκινήστε ελέγχους με ένα κλικ και αναλαμβάνουμε τα υπόλοιπα — συμπεριλαμβανομένων των υπενθυμίσεων ανανέωσης ώστε να μη χάσετε ποτέ το σήμα σας.' },
        { title: 'Προσιτό',
          body:  'Οι έλεγχοι ιστορικού ξεκινούν από $[XX] ανά εργαζόμενο, ετησίως. Μια μικρή επένδυση που αποσβένεται με την πρώτη επιπλέον κράτηση.' }
      ],
      marketingFootnote: '*Προσωρινό στοιχείο — αντικαταστήστε με πραγματικά δεδομένα όταν διατεθούν'
    },
    onboarding: {
      step1: {
        title: 'Γίνετε MCC Πιστοποιημένος',
        body: 'Το σήμα MCC Πιστοποιημένος εμφανίζεται στην καταχώρισή σας και στο προφίλ Car Club όταν τουλάχιστον το 90% των εργαζομένων σας με επαφή με πελάτες έχει σε ισχύ έλεγχο ιστορικού. Οι έλεγχοι ισχύουν για 12 μήνες.',
        screened: 'Τι ελέγχεται:\nΕθνικό ποινικό μητρώο · Μητρώο επιπέδου νομού · Μητρώο σεξουαλικών παραβατών · Επαλήθευση ταυτότητας',
        cost: 'Πόσο κοστίζει:\n$[XX] ανά εργαζόμενο · Αποτελέσματα σε 1–3 εργάσιμες ημέρες',
        need: 'Τι χρειάζεστε:\nΠλήρες όνομα κάθε εργαζομένου, ημερομηνία γέννησης, e-mail και τρέχουσα διεύθυνση. Θα χρειαστείτε επίσης τη συγκατάθεσή του (παρέχουμε τη φόρμα).',
        cta: 'Συνέχεια \u2192'
      },
      step2: {
        title: 'Προσθέστε την ομάδα σας',
        body: 'Προσθέστε κάθε εργαζόμενο με επαφή με πελάτες που θα συνεργαστεί άμεσα με πελάτες της MCC. Το προσωπικό γραφείου που δεν αλληλεπιδρά με πελάτες μπορεί να εξαιρεθεί.',
        helper: 'Δεν έχετε όλα τα στοιχεία τώρα; Μπορείτε να προσθέσετε εργαζομένους αργότερα από τον πίνακα ελέγχου παρόχου.'
      },
      step3: {
        title: 'Συγκατάθεση εργαζομένου',
        body: 'Οι έλεγχοι ιστορικού απαιτούν τη γραπτή συγκατάθεση κάθε εργαζομένου σύμφωνα με τον Fair Credit Reporting Act (FCRA). Θα στείλουμε σε κάθε εργαζόμενο μια ασφαλή φόρμα συγκατάθεσης μέσω e-mail.',
        confirm: 'Συνεχίζοντας, επιβεβαιώνετε ότι έχετε εξουσιοδότηση να υποβάλετε ελέγχους ιστορικού για λογαριασμό των εργαζομένων που αναγράφονται.',
        cta: 'Αποστολή Φορμών Συγκατάθεσης \u2192'
      },
      step4: {
        title: 'Είστε στον δρόμο για να γίνετε Πιστοποιημένος',
        body: function (n) {
          return 'Έχουν ξεκινήσει έλεγχοι ιστορικού για ' + (n || 0) + ' εργαζομένους. Τα περισσότερα αποτελέσματα έρχονται μέσα σε 1–3 εργάσιμες ημέρες.';
        },
        next: [
          'Κάθε εργαζόμενος θα λάβει φόρμα συγκατάθεσης μέσω e-mail',
          'Μόλις επιβεβαιωθεί η συγκατάθεση και ολοκληρωθεί ο έλεγχος, τα αποτελέσματα ενημερώνονται αυτόματα',
          'Όταν το 90% της ομάδας σας έχει εγκριθεί, το σήμα Πιστοποιημένος ενεργοποιείται',
          'Θα λάβετε e-mail όταν το σήμα σας θα είναι ενεργό'
        ],
        cta: 'Στον Πίνακα Ελέγχου \u2192'
      },
      skipLong:        'Παράλειψη προς το παρόν — θα το ρυθμίσω αργότερα',
      skipShort:       'Παράλειψη προς το παρόν',
      addEmployee:     '+ Προσθήκη άλλου εργαζομένου',
      errorNoEmployees:'Προσθέστε τουλάχιστον έναν εργαζόμενο, ή παραλείψτε προς το παρόν.',
      errorIncomplete: 'Κάθε εργαζόμενος χρειάζεται τουλάχιστον ένα όνομα και ένα e-mail.',
      errorConsent:    'Επιβεβαιώστε την εξουσιοδότηση για να συνεχίσετε.',
      errorInitiateAll:function (msg) {
        return 'Δεν μπορέσαμε να ξεκινήσουμε κανέναν έλεγχο ιστορικού (' + (msg || 'άγνωστο σφάλμα') + '). Επαληθεύστε τα στοιχεία και δοκιμάστε ξανά, ή παραλείψτε προς το παρόν.';
      },
      errorPartial:    function (n) {
        return ' (' + (n || 0) + ' δεν εστάλησαν — μπορείτε να επαναλάβετε από τον πίνακα ελέγχου σας.)';
      },
      employeeN:       function (n) { return 'Εργαζόμενος ' + n; },
      remove:          'Αφαίρεση'
    },
    badge: {
      fullDetail: function (compliant, total) {
        return (compliant || 0) + ' από ' + (total || 0) + ' εργαζόμενοι ελεγμένοι · Ανανέωση ετησίως';
      },
      tooltip:
        'Η ομάδα αυτού του παρόχου ελέγχεται μέσω του αναγνωρισμένου συνεργάτη ελέγχου της MCC. Οι έλεγχοι περιλαμβάνουν ποινικό ιστορικό, μητρώο σεξουαλικών παραβατών και επαλήθευση ταυτότητας. Ανανεώνονται κάθε χρόνο.',
      modal: {
        header: 'Τι σημαίνει MCC Πιστοποιημένος;',
        body:   'Οι πάροχοι με το σήμα MCC Πιστοποιημένος διατηρούν ισχύοντες ελέγχους ιστορικού για τουλάχιστον το 90% των εργαζομένων τους με επαφή με πελάτες. Οι έλεγχοι διενεργούνται από εθνικά αναγνωρισμένη υπηρεσία ελέγχου και πρέπει να ανανεώνονται κάθε 12 μήνες.',
        included: 'Τι περιλαμβάνει ο έλεγχος; • Αναζήτηση εθνικού ποινικού ιστορικού • Ποινικό μητρώο επιπέδου νομού • Εθνικό μητρώο σεξουαλικών παραβατών • Επαλήθευση ταυτότητας',
        guarantee: 'Είναι αυτή εγγύηση; Το σήμα MCC Πιστοποιημένος δηλώνει ότι ένας πάροχος έχει ολοκληρώσει τη διαδικασία ελέγχου και διατηρεί τη συμμόρφωση. Δεν αποτελεί εγγύηση μελλοντικής συμπεριφοράς. Σας ενθαρρύνουμε να χρησιμοποιείτε τη δική σας κρίση παράλληλα με αυτές τις πληροφορίες.',
        learnMore: 'Μάθετε περισσότερα για τη δέσμευση ασφάλειας της MCC \u2192'
      }
    },
    homepage: {
      customerHeader: 'Το αυτοκίνητό σας. Η εμπιστοσύνη σας. Η πιστοποίησή μας.',
      customerBody:
        'Κάθε Πιστοποιημένος Πάροχος MCC έχει περάσει ολοκληρωμένο έλεγχο ιστορικού για την ομάδα του. Αναζητήστε το σήμα \u2713 όταν περιηγείστε σε παρόχους — σημαίνει ότι οι εργαζόμενοί τους είναι ελεγμένοι, πιστοποιημένοι και ενημερωμένοι.',
      customerCta: 'Περιηγηθείτε σε Πιστοποιημένους Παρόχους \u2192',
      howItWorksHeader: 'Επιλέξτε με σιγουριά',
      howItWorksBody:
        'Συγκρίνετε προσφορές από πιστοποιημένους παρόχους. Το σήμα \u2713 σημαίνει ότι η ομάδα τους έχει ελεγχθεί μέσω του αναγνωρισμένου συνεργάτη ελέγχου μας, με ανανεώσεις κάθε χρόνο.',
      providerHeader: 'Οι πιστοποιημένοι πάροχοι κλείνουν περισσότερες δουλειές',
      providerBody:
        'Το σήμα MCC Πιστοποιημένος λέει στους πελάτες ότι η ομάδα σας είναι ελεγμένη και αξιόπιστη. Είναι ο γρηγορότερος τρόπος για να χτίσετε αξιοπιστία στην πλατφόρμα — και οι πιστοποιημένοι πάροχοι έχουν μεγαλύτερα ποσοστά αποδοχής προσφορών και περισσότερους επαναλαμβανόμενους πελάτες.',
      providerColumns: [
        { title: 'Ολοκληρωμένος Έλεγχος',
          body:  'Εθνικό ποινικό μητρώο, μητρώο σεξουαλικών παραβατών και επαλήθευση ταυτότητας — όλα μέσω του αναγνωρισμένου συνεργάτη μας.' },
        { title: 'Πάντα Ενημερωμένο',
          body:  'Οι ετήσιες ανανεώσεις διατηρούν το σήμα σας ενημερωμένο. Στέλνουμε υπενθυμίσεις 60, 30, 14 και 7 ημέρες πριν τη λήξη — δεν θα σας πιάσει ποτέ απροετοίμαστους.' },
        { title: 'Απλή Συμμόρφωση',
          body:  'Ο πίνακας ελέγχου παρόχου δείχνει ακριβώς πού βρίσκεστε: ποιος είναι πιστοποιημένος, ποιος λήγει και τι να κάνετε στη συνέχεια.' }
      ],
      providerCtaNew:      'Ξεκινήστε την Πιστοποίησή σας \u2192',
      providerCtaExisting: 'Διαχειριστείτε την Ομάδα σας \u2192',
      trustBar:
        '\u2713 Πάροχοι με ελεγμένο ιστορικό · Απαιτείται ετήσια ανανέωση · \u2713 Ελάχιστη συμμόρφωση ομάδας 90% · Εθνικά αναγνωρισμένος έλεγχος'
    },
    legal: {
      consumer:
        'Οι πληροφορίες ελέγχου ιστορικού παρέχονται από εξωτερική υπηρεσία αναφορών καταναλωτή. Η My Car Concierge δεν διενεργεί ελέγχους ιστορικού άμεσα. Το σήμα MCC Πιστοποιημένος δηλώνει ότι ένας πάροχος πληρούσε τις απαιτήσεις συμμόρφωσης του προγράμματος κατά τη στιγμή της πιστοποίησης. Δεν αποτελεί εγγύηση ή προσυπογραφή του χαρακτήρα, των προσόντων ή της μελλοντικής συμπεριφοράς οποιουδήποτε παρόχου. Η My Car Concierge δεν φέρει ευθύνη για τις πράξεις ή παραλείψεις οποιουδήποτε παρόχου υπηρεσιών. Οι καταναλωτές πρέπει να ασκούν την κρίση τους κατά την επιλογή παρόχων.'
    }
  };

  // ---------------------------------------------------------------------------
  // Chinese — Simplified (zh)
  // ---------------------------------------------------------------------------
  const COPY_ZH = {
    branding: {
      featureName:    'MCC 认证',
      tagline:        '严选服务商。可靠承诺。',
      badgeLabel:     '\u2713 背景已核实',
      compactLabel:   '\u2713 已认证',
      programName:    'MCC 认证服务商计划'
    },
    customer: {
      tooltipBadge:
        '该服务商对至少 90% 的客户接触员工保持有效的背景调查记录,经全国认可的背景调查机构核实。背景调查每年更新一次。',
      cardSubtitle:
        '\u2713 背景已核实 — 员工经过筛查且记录有效',
      filterLabel: '仅显示已认证服务商',
      filterDescription:
        '已认证服务商对其员工保持有效的背景调查记录,每年更新一次。',

      detailHeader: '关于 MCC 认证',
      detailBody: function (providerName) {
        return (providerName || '该服务商') +
          ' 是 MCC 认证服务商。这意味着至少 90% 的客户接触团队成员已通过我们全国认可的筛查合作伙伴的全面背景调查。这些调查每年更新一次,以确保持续合规。';
      },
      detailIncluded:
        '筛查内容包括:• 犯罪记录搜索(全国 + 县级) • 性犯罪者登记册查询 • 身份验证',
      detailFooter:
        'MCC 高度重视您的安全。已认证徽章让您安心,因为为您车辆服务的人员都经过了专业筛查。',

      whyHeader: '这为什么重要?',
      whyBody:
        '您把车辆托付给某人 — 通常是在您家中或工作场所。MCC 认证服务商已多走一步证明自己值得信赖。背景调查不是加入 MCC 的强制要求,但完成调查的服务商可以获得已认证徽章,让您能够轻松放心地选择。',

      ccHeader: 'MCC 认证服务商',
      ccBody: function (compliant, total, lastVerified) {
        return (total || 0) + ' 名团队成员中,有 ' + (compliant || 0) + ' 名背景调查记录有效\n上次认证:' + (lastVerified || '\u2014');
      },
      ccNotVerified:
        '该服务商尚未完成 MCC 认证计划。您仍然可以向其请求报价 — 许多优秀服务商正在认证流程中。'
    },
    provider: {
      cardActive: function (pct) {
        return {
          title: 'MCC 认证 — 有效 \u2713',
          body:  '您的团队合规率为 ' + pct + '%。您的已认证徽章已上线并对客户可见。',
          cta:   '查看合规详情 \u2192'
        };
      },
      cardAtRisk: function (pct, count) {
        return {
          title: 'MCC 认证 — 风险中',
          body:  '您的合规率为 ' + pct + '%。需要 90% 才能保留已认证徽章。' + count + ' 名员工需要关注。',
          cta:   '查看详情 \u2192'
        };
      },
      cardInactive: function (pct) {
        return {
          title: 'MCC 认证 — 已失效 \u2717',
          body:  '您的合规率已降至 ' + pct + '%。已认证徽章已从您的展示页移除。请续期已过期的调查以恢复徽章。',
          cta:   '立即续期 \u2192'
        };
      },
      cardNotEnrolled: {
        title: '获得 MCC 认证',
        body:  '在竞争中脱颖而出。已完成背景调查的服务商获得的客户报价响应最多可增加 3 倍。',
        cta:   '开始认证流程 \u2192'
      },
      marketingHeadline: '赢得客户信任的徽章',
      marketingSubhead:
        'MCC 认证服务商获得更多曝光、更多报价和更多回头客。背景调查快速、实惠,可以直接在您的控制台内办理。',
      valueProps: [
        { title: '在搜索中脱颖而出',
          body:  '已认证服务商在搜索结果中突出显示,并优先推荐给您所在地区的客户。' },
        { title: '即刻建立信任',
          body:  '78% 的车主表示更倾向于选择拥有已核实背景调查的服务商。*' },
        { title: '简单合规',
          body:  '添加您的团队,一键发起调查,我们处理其余事项 — 包括续期提醒,让您永远不会失去徽章。' },
        { title: '价格实惠',
          body:  '背景调查每位员工每年起价 $[XX]。一笔小投资,只需多接一单就能回本。' }
      ],
      marketingFootnote: '*占位数据 — 待真实调查/数据可用时替换'
    },
    onboarding: {
      step1: {
        title: '获得 MCC 认证',
        body: '当您至少 90% 的客户接触员工拥有有效的背景调查记录时,MCC 认证徽章将出现在您的展示页和 Car Club 个人资料中。背景调查有效期为 12 个月。',
        screened: '筛查内容:\n全国犯罪记录 · 县级犯罪记录 · 性犯罪者登记册 · 身份验证',
        cost: '费用:\n每位员工 $[XX] · 1–3 个工作日内出结果',
        need: '所需信息:\n每位员工的全名、出生日期、电子邮件和当前地址。还需要他们的同意(我们会提供表单)。',
        cta: '继续 \u2192'
      },
      step2: {
        title: '添加您的团队',
        body: '请添加每一位将直接与 MCC 客户接触的员工。不与客户互动的后台员工可以排除在外。',
        helper: '现在没有所有人的信息?您可以稍后从服务商控制台添加员工。'
      },
      step3: {
        title: '员工同意',
        body: '根据《公平信用报告法》(FCRA),背景调查需要每位员工的书面同意。我们将通过电子邮件向每位员工发送一份安全的同意书。',
        confirm: '继续即表示您确认已获授权代表所列员工提交背景调查。',
        cta: '发送同意书 \u2192'
      },
      step4: {
        title: '您即将获得认证',
        body: function (n) {
          return '已为 ' + (n || 0) + ' 名员工发起背景调查。大多数结果将在 1–3 个工作日内返回。';
        },
        next: [
          '每位员工将通过电子邮件收到同意书',
          '同意确认且调查完成后,结果将自动更新',
          '当您团队的 90% 通过审核时,已认证徽章将上线',
          '徽章生效时您将收到电子邮件'
        ],
        cta: '前往控制台 \u2192'
      },
      skipLong:        '暂时跳过 — 我稍后再设置',
      skipShort:       '暂时跳过',
      addEmployee:     '+ 添加另一位员工',
      errorNoEmployees:'至少添加一位员工,或暂时跳过。',
      errorIncomplete: '每位员工至少需要姓名和电子邮件。',
      errorConsent:    '请确认授权以继续。',
      errorInitiateAll:function (msg) {
        return '我们无法发起任何背景调查(' + (msg || '未知错误') + ')。请核实信息后重试,或暂时跳过。';
      },
      errorPartial:    function (n) {
        return ' (' + (n || 0) + ' 项未能发送 — 您可以从控制台重试。)';
      },
      employeeN:       function (n) { return '员工 ' + n; },
      remove:          '移除'
    },
    badge: {
      fullDetail: function (compliant, total) {
        return (total || 0) + ' 名员工中已筛查 ' + (compliant || 0) + ' 名 · 每年更新';
      },
      tooltip:
        '该服务商的团队由 MCC 的认可筛查合作伙伴进行背景调查。调查包括犯罪记录、性犯罪者登记册和身份验证。每年更新。',
      modal: {
        header: 'MCC 认证是什么意思?',
        body:   '拥有 MCC 认证徽章的服务商对其至少 90% 的客户接触员工保持有效的背景调查。调查由全国认可的筛查机构进行,必须每 12 个月更新一次。',
        included: '筛查包括什么? • 全国犯罪记录搜索 • 县级犯罪记录 • 全国性犯罪者登记册 • 身份验证',
        guarantee: '这是保证吗? MCC 认证徽章表明服务商已完成筛查流程并保持合规。它不是对未来行为的保证。我们鼓励您在参考此信息的同时运用自己的判断。',
        learnMore: '了解更多关于 MCC 安全承诺的信息 \u2192'
      }
    },
    homepage: {
      customerHeader: '您的爱车。您的信任。我们的认证。',
      customerBody:
        '每一位 MCC 认证服务商都为其团队完成了全面的背景调查筛查。浏览服务商时请寻找 \u2713 徽章 — 这意味着他们的员工已经过筛查、核实且记录有效。',
      customerCta: '浏览已认证服务商 \u2192',
      howItWorksHeader: '放心选择',
      howItWorksBody:
        '比较已认证服务商的报价。\u2713 徽章意味着他们的团队已通过我们认可的筛查合作伙伴的背景调查,且每年更新。',
      providerHeader: '已认证服务商接到更多订单',
      providerBody:
        'MCC 认证徽章告诉客户您的团队经过背景调查且值得信赖。这是在平台上建立信誉最快的方式 — 已认证服务商的报价接受率更高,回头客也更多。',
      providerColumns: [
        { title: '全面筛查',
          body:  '全国犯罪记录、性犯罪者登记册和身份验证 — 由我们的认可合作伙伴处理。' },
        { title: '始终有效',
          body:  '每年续期让您的徽章保持有效。我们会在到期前 60、30、14 和 7 天发送提醒 — 您永远不会措手不及。' },
        { title: '简单合规',
          body:  '您的服务商控制台清楚地显示您的状态:谁已认证、谁即将到期,以及下一步该做什么。' }
      ],
      providerCtaNew:      '开始您的认证 \u2192',
      providerCtaExisting: '管理您的团队 \u2192',
      trustBar:
        '\u2713 已完成背景调查的服务商 · 每年必须续期 · \u2713 团队合规率最低 90% · 全国认可筛查'
    },
    legal: {
      consumer:
        '背景调查信息由第三方消费者报告机构提供。My Car Concierge 不直接进行背景调查。MCC 认证徽章表明服务商在认证时符合本计划的合规要求。这并非对任何服务商品德、资格或未来行为的保证、担保或背书。My Car Concierge 不对任何服务商的行为或疏忽承担责任。消费者在选择服务商时应运用自己的判断。'
    }
  };

  // ---------------------------------------------------------------------------
  // Hindi (hi)
  // ---------------------------------------------------------------------------
  const COPY_HI = {
    branding: {
      featureName:    'MCC सत्यापित',
      tagline:        'जाँचे गए प्रदाता। सत्यापित विश्वास।',
      badgeLabel:     '\u2713 पृष्ठभूमि सत्यापित',
      compactLabel:   '\u2713 सत्यापित',
      programName:    'MCC सत्यापित प्रदाता कार्यक्रम'
    },
    customer: {
      tooltipBadge:
        'यह प्रदाता ग्राहकों के साथ सीधे काम करने वाले अपने कम से कम 90% कर्मचारियों की वर्तमान पृष्ठभूमि जाँच बनाए रखता है, जो राष्ट्रीय स्तर पर मान्यता प्राप्त स्क्रीनिंग सेवा द्वारा सत्यापित है। जाँच हर साल नवीनीकृत की जाती है।',
      cardSubtitle:
        '\u2713 पृष्ठभूमि सत्यापित — कर्मचारी जाँचे गए और वर्तमान',
      filterLabel: 'केवल सत्यापित प्रदाता दिखाएँ',
      filterDescription:
        'सत्यापित प्रदाता अपने कर्मचारियों की वर्तमान पृष्ठभूमि जाँच बनाए रखते हैं, जो हर साल नवीनीकृत होती है।',

      detailHeader: 'MCC सत्यापित के बारे में',
      detailBody: function (providerName) {
        return (providerName || 'यह प्रदाता') +
          ' एक MCC सत्यापित प्रदाता है। इसका मतलब है कि उनकी ग्राहक-संपर्क टीम के कम से कम 90% सदस्यों ने हमारे राष्ट्रीय स्तर पर मान्यता प्राप्त स्क्रीनिंग साझेदार के माध्यम से व्यापक पृष्ठभूमि जाँच पास की है। ये जाँच निरंतर अनुपालन सुनिश्चित करने के लिए हर साल नवीनीकृत की जाती हैं।';
      },
      detailIncluded:
        'स्क्रीनिंग में क्या शामिल है: • आपराधिक इतिहास खोज (राष्ट्रीय + काउंटी स्तर) • यौन अपराधी रजिस्ट्री जाँच • पहचान सत्यापन',
      detailFooter:
        'MCC आपकी सुरक्षा को गंभीरता से लेता है। सत्यापित बैज आपको यह आश्वासन देता है कि आपके वाहन पर काम करने वाले लोगों की पेशेवर रूप से जाँच की गई है।',

      whyHeader: 'यह क्यों मायने रखता है?',
      whyBody:
        'आप अपना वाहन किसी पर भरोसा कर रहे हैं — अक्सर अपने घर या कार्यस्थल पर। MCC सत्यापित प्रदाताओं ने यह साबित करने के लिए अतिरिक्त प्रयास किया है कि वे विश्वसनीय हैं। MCC में शामिल होने के लिए पृष्ठभूमि जाँच अनिवार्य नहीं है, लेकिन जो प्रदाता इन्हें पूरा करते हैं वे सत्यापित बैज अर्जित करते हैं, जिससे आपको आत्मविश्वास के साथ चुनने का आसान तरीका मिलता है।',

      ccHeader: 'MCC सत्यापित प्रदाता',
      ccBody: function (compliant, total, lastVerified) {
        return (total || 0) + ' टीम सदस्यों में से ' + (compliant || 0) + ' की पृष्ठभूमि जाँच वर्तमान है\nअंतिम सत्यापन: ' + (lastVerified || '\u2014');
      },
      ccNotVerified:
        'इस प्रदाता ने अभी तक MCC सत्यापित कार्यक्रम पूरा नहीं किया है। आप अभी भी उनसे बोलियाँ माँग सकते हैं — कई बेहतरीन प्रदाता सत्यापन की प्रक्रिया में हैं।'
    },
    provider: {
      cardActive: function (pct) {
        return {
          title: 'MCC सत्यापित — सक्रिय \u2713',
          body:  'आपकी टीम ' + pct + '% अनुपालन में है। आपका सत्यापित बैज लाइव है और ग्राहकों को दिखाई देता है।',
          cta:   'अनुपालन विवरण देखें \u2192'
        };
      },
      cardAtRisk: function (pct, count) {
        return {
          title: 'MCC सत्यापित — जोखिम में',
          body:  'आपका अनुपालन ' + pct + '% पर है। सत्यापित बैज बनाए रखने के लिए आपको 90% चाहिए। ' + count + ' कर्मचारी(यों) पर ध्यान देने की आवश्यकता है।',
          cta:   'विवरण देखें \u2192'
        };
      },
      cardInactive: function (pct) {
        return {
          title: 'MCC सत्यापित — निष्क्रिय \u2717',
          body:  'आपका अनुपालन ' + pct + '% तक गिर गया है। आपका सत्यापित बैज आपकी लिस्टिंग से हटा दिया गया है। इसे पुनर्स्थापित करने के लिए समाप्त जाँच नवीनीकृत करें।',
          cta:   'अभी नवीनीकृत करें \u2192'
        };
      },
      cardNotEnrolled: {
        title: 'MCC सत्यापित बनें',
        body:  'प्रतिस्पर्धा से अलग दिखें। पृष्ठभूमि-जाँचे गए प्रदाताओं को ग्राहकों से 3 गुना तक अधिक बोली प्रतिक्रियाएँ मिलती हैं।',
        cta:   'सत्यापन प्रक्रिया शुरू करें \u2192'
      },
      marketingHeadline: 'वह बैज अर्जित करें जिस पर ग्राहक भरोसा करते हैं',
      marketingSubhead:
        'MCC सत्यापित प्रदाताओं को अधिक दृश्यता, अधिक बोलियाँ और अधिक दोहराए जाने वाले ग्राहक मिलते हैं। पृष्ठभूमि जाँच तेज़, किफ़ायती और सीधे आपके डैशबोर्ड के अंदर संभाली जाती है।',
      valueProps: [
        { title: 'खोज में अलग दिखें',
          body:  'सत्यापित प्रदाता खोज परिणामों में हाइलाइट किए जाते हैं और आपके क्षेत्र के ग्राहकों को पहले अनुशंसित किए जाते हैं।' },
        { title: 'तत्काल विश्वास बनाएँ',
          body:  '78% वाहन मालिक कहते हैं कि वे सत्यापित पृष्ठभूमि जाँच वाले प्रदाता को चुनने की अधिक संभावना रखते हैं।*' },
        { title: 'सरल अनुपालन',
          body:  'अपनी टीम जोड़ें, एक क्लिक से जाँच शुरू करें, और बाक़ी हम संभाल लेंगे — नवीनीकरण अनुस्मारक सहित ताकि आप अपना बैज कभी न खोएँ।' },
        { title: 'किफायती',
          body:  'पृष्ठभूमि जाँच प्रति कर्मचारी, प्रति वर्ष $[XX] से शुरू होती है। एक छोटा निवेश जो आपकी पहली अतिरिक्त बुकिंग के साथ ही चुक जाता है।' }
      ],
      marketingFootnote: '*अस्थायी आँकड़ा — जब वास्तविक सर्वेक्षण/डेटा उपलब्ध हो तो प्रतिस्थापित करें'
    },
    onboarding: {
      step1: {
        title: 'MCC सत्यापित बनें',
        body: 'जब आपके ग्राहक-संपर्क कर्मचारियों में से कम से कम 90% के पास वर्तमान पृष्ठभूमि जाँच हो, तो MCC सत्यापित बैज आपकी लिस्टिंग और Car Club प्रोफ़ाइल पर दिखाई देता है। जाँच 12 महीनों के लिए वैध हैं।',
        screened: 'क्या जाँचा जाता है:\nराष्ट्रीय आपराधिक रिकॉर्ड · काउंटी-स्तरीय रिकॉर्ड · यौन अपराधी रजिस्ट्री · पहचान सत्यापन',
        cost: 'इसकी लागत:\nप्रति कर्मचारी $[XX] · 1–3 व्यावसायिक दिनों में परिणाम',
        need: 'आपको क्या चाहिए:\nप्रत्येक कर्मचारी का पूरा नाम, जन्मतिथि, ईमेल और वर्तमान पता। आपको उनकी सहमति की भी आवश्यकता होगी (हम फ़ॉर्म प्रदान करते हैं)।',
        cta: 'जारी रखें \u2192'
      },
      step2: {
        title: 'अपनी टीम जोड़ें',
        body: 'प्रत्येक ग्राहक-संपर्क कर्मचारी जोड़ें जो MCC ग्राहकों के साथ सीधे काम करेगा। बैक-ऑफिस कर्मचारी जो ग्राहकों के साथ बातचीत नहीं करते, उन्हें बाहर रखा जा सकता है।',
        helper: 'अभी सबकी जानकारी नहीं है? आप बाद में अपने प्रदाता डैशबोर्ड से कर्मचारी जोड़ सकते हैं।'
      },
      step3: {
        title: 'कर्मचारी सहमति',
        body: 'पृष्ठभूमि जाँच के लिए Fair Credit Reporting Act (FCRA) के तहत प्रत्येक कर्मचारी की लिखित सहमति आवश्यक है। हम प्रत्येक कर्मचारी को ईमेल के माध्यम से एक सुरक्षित सहमति फ़ॉर्म भेजेंगे।',
        confirm: 'जारी रखकर, आप पुष्टि करते हैं कि आपके पास सूचीबद्ध कर्मचारियों की ओर से पृष्ठभूमि जाँच जमा करने का प्राधिकरण है।',
        cta: 'सहमति फ़ॉर्म भेजें \u2192'
      },
      step4: {
        title: 'आप सत्यापित होने के रास्ते पर हैं',
        body: function (n) {
          return (n || 0) + ' कर्मचारियों के लिए पृष्ठभूमि जाँच शुरू कर दी गई हैं। अधिकांश परिणाम 1–3 व्यावसायिक दिनों में वापस आ जाते हैं।';
        },
        next: [
          'प्रत्येक कर्मचारी को ईमेल के माध्यम से एक सहमति फ़ॉर्म प्राप्त होगा',
          'सहमति की पुष्टि होते ही और जाँच पूरी होते ही, परिणाम स्वचालित रूप से अपडेट हो जाते हैं',
          'जब आपकी टीम का 90% मंज़ूर हो जाएगा, आपका सत्यापित बैज लाइव हो जाएगा',
          'जब आपका बैज सक्रिय होगा, आपको ईमेल मिलेगा'
        ],
        cta: 'डैशबोर्ड पर जाएँ \u2192'
      },
      skipLong:        'अभी छोड़ें — मैं इसे बाद में सेट करूँगा',
      skipShort:       'अभी छोड़ें',
      addEmployee:     '+ एक और कर्मचारी जोड़ें',
      errorNoEmployees:'कम से कम एक कर्मचारी जोड़ें, या अभी छोड़ें।',
      errorIncomplete: 'प्रत्येक कर्मचारी के लिए कम से कम एक नाम और एक ईमेल आवश्यक है।',
      errorConsent:    'जारी रखने के लिए कृपया प्राधिकरण की पुष्टि करें।',
      errorInitiateAll:function (msg) {
        return 'हम कोई भी पृष्ठभूमि जाँच शुरू नहीं कर सके (' + (msg || 'अज्ञात त्रुटि') + ')। कृपया विवरण सत्यापित करें और पुनः प्रयास करें, या अभी छोड़ें।';
      },
      errorPartial:    function (n) {
        return ' (' + (n || 0) + ' भेजी नहीं जा सकीं — आप अपने डैशबोर्ड से पुनः प्रयास कर सकते हैं।)';
      },
      employeeN:       function (n) { return 'कर्मचारी ' + n; },
      remove:          'हटाएँ'
    },
    badge: {
      fullDetail: function (compliant, total) {
        return (total || 0) + ' में से ' + (compliant || 0) + ' कर्मचारी जाँचे गए · वार्षिक रूप से नवीनीकृत';
      },
      tooltip:
        'इस प्रदाता की टीम MCC के मान्यता प्राप्त स्क्रीनिंग साझेदार के माध्यम से पृष्ठभूमि-जाँची गई है। जाँच में आपराधिक इतिहास, यौन अपराधी रजिस्ट्री और पहचान सत्यापन शामिल हैं। वार्षिक रूप से नवीनीकृत।',
      modal: {
        header: 'MCC सत्यापित का क्या मतलब है?',
        body:   'MCC सत्यापित बैज वाले प्रदाता अपने ग्राहक-संपर्क कर्मचारियों में से कम से कम 90% की वर्तमान पृष्ठभूमि जाँच बनाए रखते हैं। जाँच राष्ट्रीय स्तर पर मान्यता प्राप्त स्क्रीनिंग सेवा द्वारा की जाती है और हर 12 महीने में नवीनीकृत होनी चाहिए।',
        included: 'स्क्रीनिंग में क्या शामिल है? • राष्ट्रीय आपराधिक इतिहास खोज • काउंटी-स्तरीय आपराधिक रिकॉर्ड • राष्ट्रीय यौन अपराधी रजिस्ट्री • पहचान सत्यापन',
        guarantee: 'क्या यह गारंटी है? MCC सत्यापित बैज दर्शाता है कि एक प्रदाता ने स्क्रीनिंग प्रक्रिया पूरी की है और अनुपालन बनाए रख रहा है। यह भविष्य के व्यवहार की गारंटी नहीं है। हम आपको इस जानकारी के साथ अपने स्वयं के निर्णय का उपयोग करने के लिए प्रोत्साहित करते हैं।',
        learnMore: 'MCC की सुरक्षा प्रतिबद्धता के बारे में और जानें \u2192'
      }
    },
    homepage: {
      customerHeader: 'आपकी कार। आपका विश्वास। हमारा सत्यापन।',
      customerBody:
        'प्रत्येक MCC सत्यापित प्रदाता ने अपनी टीम के लिए व्यापक पृष्ठभूमि स्क्रीनिंग पास की है। प्रदाताओं को ब्राउज़ करते समय \u2713 बैज की तलाश करें — इसका मतलब है कि उनके कर्मचारी जाँचे गए, सत्यापित और वर्तमान हैं।',
      customerCta: 'सत्यापित प्रदाता ब्राउज़ करें \u2192',
      howItWorksHeader: 'आत्मविश्वास से चुनें',
      howItWorksBody:
        'सत्यापित प्रदाताओं की बोलियों की तुलना करें। \u2713 बैज का मतलब है कि उनकी टीम हमारे मान्यता प्राप्त स्क्रीनिंग साझेदार के माध्यम से पृष्ठभूमि-जाँची गई है, हर साल नवीनीकृत जाँच के साथ।',
      providerHeader: 'सत्यापित प्रदाता अधिक काम बुक करते हैं',
      providerBody:
        'MCC सत्यापित बैज ग्राहकों को बताता है कि आपकी टीम पृष्ठभूमि-जाँची गई और भरोसेमंद है। यह प्लेटफ़ॉर्म पर विश्वसनीयता बनाने का सबसे तेज़ तरीका है — और सत्यापित प्रदाताओं को बोली स्वीकृति दर अधिक मिलती है और दोहराए जाने वाले ग्राहक भी अधिक मिलते हैं।',
      providerColumns: [
        { title: 'व्यापक स्क्रीनिंग',
          body:  'राष्ट्रीय आपराधिक रिकॉर्ड, यौन अपराधी रजिस्ट्री और पहचान सत्यापन — हमारे मान्यता प्राप्त साझेदार द्वारा संभाला जाता है।' },
        { title: 'हमेशा वर्तमान',
          body:  'वार्षिक नवीनीकरण आपके बैज को अद्यतन रखता है। हम समाप्ति से 60, 30, 14 और 7 दिन पहले अनुस्मारक भेजते हैं — आप कभी भी अप्रत्याशित रूप से नहीं पकड़े जाएँगे।' },
        { title: 'सरल अनुपालन',
          body:  'आपका प्रदाता डैशबोर्ड स्पष्ट रूप से दिखाता है कि आप कहाँ खड़े हैं: कौन सत्यापित है, किसकी समाप्ति हो रही है, और आगे क्या करना है।' }
      ],
      providerCtaNew:      'अपना सत्यापन शुरू करें \u2192',
      providerCtaExisting: 'अपनी टीम प्रबंधित करें \u2192',
      trustBar:
        '\u2713 पृष्ठभूमि-जाँचे गए प्रदाता · वार्षिक नवीनीकरण आवश्यक · \u2713 90% टीम अनुपालन न्यूनतम · राष्ट्रीय स्तर पर मान्यता प्राप्त स्क्रीनिंग'
    },
    legal: {
      consumer:
        'पृष्ठभूमि जाँच की जानकारी एक तृतीय-पक्ष उपभोक्ता रिपोर्टिंग एजेंसी द्वारा प्रदान की जाती है। My Car Concierge सीधे पृष्ठभूमि जाँच नहीं करता है। MCC सत्यापित बैज दर्शाता है कि एक प्रदाता ने सत्यापन के समय कार्यक्रम की अनुपालन आवश्यकताओं को पूरा किया था। यह किसी भी प्रदाता के चरित्र, योग्यता या भविष्य के आचरण की गारंटी, वारंटी या अनुमोदन नहीं है। My Car Concierge किसी भी सेवा प्रदाता के कार्यों या चूक के लिए ज़िम्मेदार नहीं है। उपभोक्ताओं को सेवा प्रदाताओं का चयन करते समय अपने स्वयं के निर्णय का उपयोग करना चाहिए।'
    }
  };

  // ---------------------------------------------------------------------------
  // Arabic (ar) — RTL
  // ---------------------------------------------------------------------------
  const COPY_AR = {
    branding: {
      featureName:    'MCC موثَّق',
      tagline:        'مزوّدون مدقَّقون. ثقة موثَّقة.',
      badgeLabel:     '\u2713 السجل موثَّق',
      compactLabel:   '\u2713 موثَّق',
      programName:    'برنامج المزوّدين الموثَّقين من MCC'
    },
    customer: {
      tooltipBadge:
        'يحتفظ هذا المزوّد بفحوصات سجلّ سارية لما لا يقل عن 90% من موظفيه الذين يتعاملون مباشرة مع العملاء، بتصديق من خدمة فحص معتمدة وطنياً. تُجدَّد الفحوصات سنوياً.',
      cardSubtitle:
        '\u2713 السجل موثَّق — موظفون مفحوصون وسجلّاتهم سارية',
      filterLabel: 'إظهار المزوّدين الموثَّقين فقط',
      filterDescription:
        'يحتفظ المزوّدون الموثَّقون بفحوصات سجلّ سارية لموظفيهم، تُجدَّد كل عام.',

      detailHeader: 'حول MCC موثَّق',
      detailBody: function (providerName) {
        return (providerName || 'هذا المزوّد') +
          ' مزوّد موثَّق من MCC. يعني ذلك أن ما لا يقل عن 90% من فريقه المتعامل مع العملاء قد اجتاز فحصاً شاملاً للسجلّ عبر شريكنا المعتمد وطنياً للفحص. تُجدَّد هذه الفحوصات سنوياً لضمان الامتثال المستمر.';
      },
      detailIncluded:
        'ما الذي يشمله الفحص: • البحث في السجل الجنائي (وطني ومستوى المقاطعة) • التحقق من سجل المدانين بجرائم جنسية • التحقق من الهوية',
      detailFooter:
        'تأخذ MCC سلامتك على محمل الجد. تمنحك شارة موثَّق الثقة بأن الأشخاص الذين يعملون على مركبتك قد خضعوا لفحص مهني.',

      whyHeader: 'لماذا يهم ذلك؟',
      whyBody:
        'أنت تأتمن شخصاً ما على مركبتك — غالباً في منزلك أو مكان عملك. لقد قطع المزوّدون الموثَّقون من MCC شوطاً إضافياً لإثبات جدارتهم بالثقة. فحوصات السجل ليست شرطاً للانضمام إلى MCC، لكن المزوّدين الذين يكملونها يحصلون على شارة موثَّق، مما يمنحك طريقة سهلة للاختيار بثقة.',

      ccHeader: 'مزوّد MCC موثَّق',
      ccBody: function (compliant, total, lastVerified) {
        return 'فحوصات السجل سارية لـ ' + (compliant || 0) + ' من أصل ' + (total || 0) +
          ' من أعضاء الفريق\nآخر توثيق: ' + (lastVerified || '\u2014');
      },
      ccNotVerified:
        'لم يكمل هذا المزوّد بعد برنامج MCC موثَّق. لا يزال بإمكانك طلب عروض الأسعار منه — كثير من المزوّدين الممتازين هم في طور التوثيق.'
    },
    provider: {
      cardActive: function (pct) {
        return {
          title: 'MCC موثَّق — نشط \u2713',
          body:  'فريقك ممتثل بنسبة ' + pct + '%. شارة موثَّق فعّالة وظاهرة للعملاء.',
          cta:   'عرض تفاصيل الامتثال \u2192'
        };
      },
      cardAtRisk: function (pct, count) {
        return {
          title: 'MCC موثَّق — في خطر',
          body:  'امتثالك عند ' + pct + '%. تحتاج إلى 90% للحفاظ على شارة موثَّق. ' + count + ' موظف(ين) يحتاجون إلى متابعة.',
          cta:   'عرض التفاصيل \u2192'
        };
      },
      cardInactive: function (pct) {
        return {
          title: 'MCC موثَّق — غير نشط \u2717',
          body:  'انخفض امتثالك إلى ' + pct + '%. تمت إزالة شارة موثَّق من قائمتك. جدِّد الفحوصات المنتهية لاستعادتها.',
          cta:   'تجديد الآن \u2192'
        };
      },
      cardNotEnrolled: {
        title: 'احصل على توثيق MCC',
        body:  'تميَّز عن المنافسة. يحصل المزوّدون أصحاب السجلات المفحوصة على ضعفي إلى ثلاثة أضعاف ردود عروض الأسعار من العملاء.',
        cta:   'ابدأ عملية التوثيق \u2192'
      },
      marketingHeadline: 'احصل على الشارة التي يثق بها العملاء',
      marketingSubhead:
        'يحصل المزوّدون الموثَّقون من MCC على ظهور أكبر، وعروض أسعار أكثر، وعملاء متكرّرين أكثر. فحوصات السجل سريعة وميسورة التكلفة وتُدار مباشرة من لوحة تحكمك.',
      valueProps: [
        { title: 'تميَّز في نتائج البحث',
          body:  'يُسلَّط الضوء على المزوّدين الموثَّقين في نتائج البحث ويُوصى بهم أولاً للعملاء في منطقتك.' },
        { title: 'ابنِ الثقة فوراً',
          body:  '78% من مالكي المركبات يقولون إنهم أكثر ميلاً لاختيار مزوّد بفحوصات سجل موثَّقة.*' },
        { title: 'امتثال بسيط',
          body:  'أضف فريقك، وابدأ الفحوصات بنقرة واحدة، ونحن نتولّى الباقي — بما في ذلك تنبيهات التجديد حتى لا تفقد شارتك أبداً.' },
        { title: 'ميسور التكلفة',
          body:  'تبدأ فحوصات السجل من $[XX] لكل موظف سنوياً. استثمار صغير يسترد قيمته مع أول حجز إضافي.' }
      ],
      marketingFootnote: '*إحصائية مؤقتة — تُستبدل ببيانات حقيقية عند توفّرها'
    },
    onboarding: {
      step1: {
        title: 'احصل على توثيق MCC',
        body: 'تظهر شارة MCC موثَّق على قائمتك وعلى ملف Car Club الخاص بك عندما يكون لدى ما لا يقل عن 90% من موظفيك المتعاملين مع العملاء فحص سجل ساري المفعول. الفحوصات صالحة لمدة 12 شهراً.',
        screened: 'ما الذي يُفحص:\nالسجلات الجنائية الوطنية · سجلات على مستوى المقاطعة · سجل المدانين بجرائم جنسية · التحقق من الهوية',
        cost: 'التكلفة:\n$[XX] لكل موظف · النتائج خلال 1–3 أيام عمل',
        need: 'ما تحتاج إليه:\nالاسم الكامل لكل موظف، تاريخ الميلاد، البريد الإلكتروني، والعنوان الحالي. ستحتاج أيضاً إلى موافقته (نحن نوفّر النموذج).',
        cta: 'متابعة \u2192'
      },
      step2: {
        title: 'أضف فريقك',
        body: 'أضف كل موظف يتعامل مع العملاء سيعمل مباشرة مع عملاء MCC. يمكن استبعاد موظفي المكاتب الذين لا يتفاعلون مع العملاء.',
        helper: 'ليست لديك معلومات الجميع الآن؟ يمكنك إضافة الموظفين لاحقاً من لوحة تحكم المزوّد.'
      },
      step3: {
        title: 'موافقة الموظف',
        body: 'تتطلّب فحوصات السجل موافقة خطية من كل موظف بموجب قانون التقارير الائتمانية العادلة (FCRA). سنرسل إلى كل موظف نموذج موافقة آمناً عبر البريد الإلكتروني.',
        confirm: 'بالمتابعة، أنت تؤكد أن لديك التفويض لتقديم فحوصات السجل نيابة عن الموظفين المدرجين.',
        cta: 'إرسال نماذج الموافقة \u2192'
      },
      step4: {
        title: 'أنت في طريقك إلى التوثيق',
        body: function (n) {
          return 'تم إطلاق فحوصات السجل لـ ' + (n || 0) + ' موظفين. تعود معظم النتائج خلال 1–3 أيام عمل.';
        },
        next: [
          'سيتلقّى كل موظف نموذج موافقة عبر البريد الإلكتروني',
          'بمجرد تأكيد الموافقة واكتمال الفحص، تُحدَّث النتائج تلقائياً',
          'عندما تتم الموافقة على 90% من فريقك، تُفعَّل شارة موثَّق',
          'ستصلك رسالة بريد إلكتروني عند تفعيل شارتك'
        ],
        cta: 'الانتقال إلى لوحة التحكم \u2192'
      },
      skipLong:        'تخطّي الآن — سأقوم بإعداد ذلك لاحقاً',
      skipShort:       'تخطّي الآن',
      addEmployee:     '+ إضافة موظف آخر',
      errorNoEmployees:'أضف موظفاً واحداً على الأقل، أو تخطّى الآن.',
      errorIncomplete: 'يحتاج كل موظف إلى اسم وبريد إلكتروني على الأقل.',
      errorConsent:    'يرجى تأكيد التفويض للمتابعة.',
      errorInitiateAll:function (msg) {
        return 'لم نتمكّن من بدء أي فحص سجل (' + (msg || 'خطأ غير معروف') + '). يرجى التحقق من التفاصيل والمحاولة مرة أخرى، أو التخطّي الآن.';
      },
      errorPartial:    function (n) {
        return ' (' + (n || 0) + ' لم يُمكن إرسالها — يمكنك إعادة المحاولة من لوحة التحكم.)';
      },
      employeeN:       function (n) { return 'موظف ' + n; },
      remove:          'إزالة'
    },
    badge: {
      fullDetail: function (compliant, total) {
        return (compliant || 0) + ' من أصل ' + (total || 0) + ' موظفين مفحوصين · يُجدَّد سنوياً';
      },
      tooltip:
        'فريق هذا المزوّد مفحوص من خلال شريك الفحص المعتمد لدى MCC. تشمل الفحوصات السجل الجنائي وسجل المدانين بجرائم جنسية والتحقق من الهوية. تُجدَّد سنوياً.',
      modal: {
        header: 'ماذا يعني MCC موثَّق؟',
        body:   'يحتفظ المزوّدون أصحاب شارة MCC موثَّق بفحوصات سجل سارية لما لا يقل عن 90% من موظفيهم المتعاملين مع العملاء. تُجرى الفحوصات بواسطة خدمة فحص معتمدة وطنياً ويجب تجديدها كل 12 شهراً.',
        included: 'ما الذي يشمله الفحص؟ • البحث في السجل الجنائي الوطني • السجلات الجنائية على مستوى المقاطعة • سجل المدانين بجرائم جنسية الوطني • التحقق من الهوية',
        guarantee: 'هل هذه ضمانة؟ تشير شارة MCC موثَّق إلى أن المزوّد قد أكمل عملية الفحص ويحافظ على الامتثال. ليست ضمانة للسلوك المستقبلي. نشجّعك على استخدام حكمك الخاص إلى جانب هذه المعلومات.',
        learnMore: 'تعرّف أكثر على التزام MCC تجاه السلامة \u2192'
      }
    },
    homepage: {
      customerHeader: 'سيارتك. ثقتك. توثيقنا.',
      customerBody:
        'كل مزوّد موثَّق من MCC قد اجتاز فحصاً شاملاً للسجل لفريقه. ابحث عن شارة \u2713 عند تصفّح المزوّدين — يعني ذلك أن موظفيهم مفحوصون وموثَّقون وسجلّاتهم سارية.',
      customerCta: 'تصفّح المزوّدين الموثَّقين \u2192',
      howItWorksHeader: 'اختر بثقة',
      howItWorksBody:
        'قارن العروض من المزوّدين الموثَّقين. شارة \u2713 تعني أن فريقهم قد فُحص عبر شريكنا المعتمد للفحص، مع تجديد الفحوصات كل عام.',
      providerHeader: 'المزوّدون الموثَّقون يحجزون مهامّ أكثر',
      providerBody:
        'تخبر شارة MCC موثَّق العملاء بأن فريقك مفحوص السجل وجدير بالثقة. إنها أسرع طريقة لبناء المصداقية على المنصّة — والمزوّدون الموثَّقون يحظون بمعدّلات قبول عروض أعلى وعملاء متكرّرين أكثر.',
      providerColumns: [
        { title: 'فحص شامل',
          body:  'سجلات جنائية وطنية، وسجل المدانين بجرائم جنسية، والتحقق من الهوية — يتولّى ذلك شريكنا المعتمد.' },
        { title: 'دائماً ساري',
          body:  'التجديدات السنوية تبقي شارتك محدّثة. نرسل تذكيرات قبل 60 و30 و14 و7 أيام من انتهاء الصلاحية — لن تُفاجأ أبداً.' },
        { title: 'امتثال بسيط',
          body:  'تُظهر لوحة تحكم المزوّد لديك بدقة أين تقف: من هو موثَّق، ومن قاربت صلاحيته على الانتهاء، وما الخطوة التالية.' }
      ],
      providerCtaNew:      'ابدأ توثيقك \u2192',
      providerCtaExisting: 'إدارة فريقك \u2192',
      trustBar:
        '\u2713 مزوّدون مفحوصو السجل · يلزم التجديد السنوي · \u2713 امتثال الفريق بحدّ أدنى 90% · فحص معتمد وطنياً'
    },
    legal: {
      consumer:
        'تُقدَّم معلومات فحص السجل من قِبَل وكالة تقارير مستهلك من طرف ثالث. لا تُجري My Car Concierge فحوصات السجل مباشرةً. تشير شارة MCC موثَّق إلى أن المزوّد قد استوفى متطلّبات الامتثال للبرنامج وقت التوثيق. ليست ضمانة أو كفالة أو تأييداً لشخصية أيّ مزوّد أو مؤهلاته أو سلوكه المستقبلي. لا تتحمّل My Car Concierge المسؤولية عن أفعال أو إغفالات أيّ مزوّد خدمة. ينبغي للمستهلكين ممارسة حكمهم الخاص عند اختيار مزوّدي الخدمات.'
    }
  };

  const LANG_MAP = {
    en: COPY_EN,
    es: COPY_ES,
    fr: COPY_FR,
    el: COPY_EL,
    zh: COPY_ZH,
    hi: COPY_HI,
    ar: COPY_AR
  };

  // BCP-47 tags for date / number formatting consumers (e.g. bgc-badge.js).
  const LANG_TAG = {
    en: 'en-US',
    es: 'es-ES',
    fr: 'fr-FR',
    el: 'el-GR',
    zh: 'zh-CN',
    hi: 'hi-IN',
    ar: 'ar'
  };

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

  // Reverse-lookup the active language code from the live MCC_BGC_COPY pointer
  // so consumers can ask for it without re-reading localStorage.
  function getActiveLang() {
    for (const k in LANG_MAP) {
      if (LANG_MAP[k] === global.MCC_BGC_COPY) return k;
    }
    return detectLang();
  }

  function getActiveLanguageTag() {
    return LANG_TAG[getActiveLang()] || 'en-US';
  }

  global.MCC_BGC_COPY_EN = COPY_EN;
  global.MCC_BGC_COPY_ES = COPY_ES;
  global.MCC_BGC_COPY_FR = COPY_FR;
  global.MCC_BGC_COPY_EL = COPY_EL;
  global.MCC_BGC_COPY_ZH = COPY_ZH;
  global.MCC_BGC_COPY_HI = COPY_HI;
  global.MCC_BGC_COPY_AR = COPY_AR;
  global.MCC_BGC_COPY_SET_LANG = setLang;
  global.MCC_BGC_COPY_GET_LANGUAGE_TAG = getActiveLanguageTag;
  global.MCC_BGC_COPY = LANG_MAP[detectLang()] || COPY_EN;
})(typeof window !== 'undefined' ? window : globalThis);
