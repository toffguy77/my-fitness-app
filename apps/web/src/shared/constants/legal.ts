/**
 * Who sells the service, as the offer, the privacy policy and the footer name
 * them.
 *
 * One declaration for all three: the offer and the policy used to name a
 * company that does not exist ("ООО BURCEV", ИНН 1234567890), which left the
 * offer without a party to it and the policy without an operator.
 *
 * What is published is what a seller must disclose and an acquirer checks:
 * the name, ИНН, ОГРНИП, the registered address and a contact. Bank details are
 * deliberately absent — they go on invoices, not on a public page.
 *
 * The address keeps every element of the ЕГРИП record, in ordinary case.
 */
export const SELLER = {
    fullName: 'Индивидуальный предприниматель Бурцев Сергей Викторович',
    shortName: 'ИП Бурцев С. В.',
    personName: 'Бурцев Сергей Викторович',
    inn: '572006540445',
    ogrnip: '324774600419913',
    address:
        '108826, Россия, г. Москва, Новомосковский округ, поселение Сосенское, п. Коммунарка, ул. Александры Монаховой, д. 90, корп. 1, кв. 145',
    email: 'legal@burcev.team',
} as const

/** The date both documents were last revised. */
export const LEGAL_DOCUMENTS_UPDATED = '6 октября 2026 г.'
