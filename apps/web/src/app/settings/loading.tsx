import { SegmentLoading } from '@/shared/components/SegmentLoading'
import { t } from '@/shared/i18n'

export default function Loading() {
    return <SegmentLoading label={t('settings.loadingSegment')} />
}
