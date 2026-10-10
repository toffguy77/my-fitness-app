// Обложки лежат в нашем хранилище. Адрес с чужого хоста не рисуется:
// оптимизатор Next выключен (`unoptimized`), и белый список хоста — то, что
// не даёт статье стать окном для произвольной картинки.
const ALLOWED_IMAGE_HOSTS = ['storage.yandexcloud.net']

export function isTrustedImageUrl(url: string | null | undefined): url is string {
    if (!url) return false
    try {
        return ALLOWED_IMAGE_HOSTS.includes(new URL(url).hostname)
    } catch {
        return false
    }
}
