import { SELLER } from '@/shared/constants/legal'

/**
 * The seller, named where the service is sold. An acquirer checks for it on
 * the site, not only inside the offer.
 */
export function SellerLine({ className }: { className?: string }) {
    return (
        <p className={className}>
            {SELLER.shortName}, ИНН {SELLER.inn}, ОГРНИП {SELLER.ogrnip}
        </p>
    )
}
