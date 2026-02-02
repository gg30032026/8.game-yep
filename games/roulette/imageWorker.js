/**
 * Image Resize Web Worker
 * Processes image resizing off the main thread for better UI responsiveness
 */

self.onmessage = async function (e) {
    const { imageData, maxSize, quality, id } = e.data;

    try {
        // Create ImageBitmap from blob
        const blob = new Blob([imageData], { type: 'image/jpeg' });
        const bitmap = await createImageBitmap(blob);

        let { width, height } = bitmap;

        // Calculate new dimensions
        if (width > height) {
            if (width > maxSize) {
                height = Math.round((height * maxSize) / width);
                width = maxSize;
            }
        } else {
            if (height > maxSize) {
                width = Math.round((width * maxSize) / height);
                height = maxSize;
            }
        }

        // Use OffscreenCanvas for resizing
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Draw resized image
        ctx.drawImage(bitmap, 0, 0, width, height);

        // Convert to blob
        const resizedBlob = await canvas.convertToBlob({
            type: 'image/jpeg',
            quality: quality
        });

        // Send back as ArrayBuffer for transfer
        const arrayBuffer = await resizedBlob.arrayBuffer();

        self.postMessage({
            success: true,
            id: id,
            data: arrayBuffer,
            originalSize: imageData.byteLength,
            newSize: arrayBuffer.byteLength
        }, [arrayBuffer]);

    } catch (error) {
        self.postMessage({
            success: false,
            id: id,
            error: error.message
        });
    }
};
