/**
 * Image compression utility for AI food recognition
 *
 * Resizes images to max 1280px on longest side and compresses as JPEG.
 * Used before uploading photos to reduce bandwidth and processing time.
 *
 * @module food-tracker/api/compressImage
 */

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.8;

/**
 * Compress and resize an image file for upload.
 * - Resizes to max 1280px on the longest side (preserving aspect ratio)
 * - Outputs as JPEG at 0.8 quality
 * - If image is already smaller than 1280px, no resize is performed
 *
 * @param file - Original image File
 * @returns Compressed File object (JPEG)
 */
export async function compressImage(file: File): Promise<File> {
    const imageBitmap = await createImageBitmap(file);

    const { width, height } = imageBitmap;

    let targetWidth = width;
    let targetHeight = height;

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width >= height) {
            targetWidth = MAX_DIMENSION;
            targetHeight = Math.round((height / width) * MAX_DIMENSION);
        } else {
            targetHeight = MAX_DIMENSION;
            targetWidth = Math.round((width / height) * MAX_DIMENSION);
        }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to get canvas 2d context');
    }

    ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);
    imageBitmap.close();

    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (result) => {
                if (result) {
                    resolve(result);
                } else {
                    reject(new Error('Failed to compress image'));
                }
            },
            'image/jpeg',
            JPEG_QUALITY,
        );
    });

    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
        type: 'image/jpeg',
    });
}
