/** Feature settings and its private editor state. */
function createAppearanceBranding({ lifecycle }) {
    // Each image has independent reads and mutations. A newer action owns its UI,
    // while already requested server mutations are allowed to finish.
    const revisions = new Map();
    function beginOperation(config) {
        const revision = (revisions.get(config.fileName) || 0) + 1;
        revisions.set(config.fileName, revision);
        return () => !lifecycle.disposed && revisions.get(config.fileName) === revision;
    }
    // Setup branding file uploads and previews
    function setupBrandingUploads() {
        const uploadConfigs = [
            {
                inputId: 'iconTransparentInput',
                dropZoneId: 'iconTransparentDropZone',
                statusId: 'iconTransparentStatus',
                fileName: 'icon-transparent.png',
                previewId: 'iconTransparentPreview',
                placeholderId: 'iconTransparentPlaceholder',
                deleteId: 'iconTransparentDelete',
                dimensionsId: 'iconTransparentDimensions',
            },
            {
                inputId: 'faviconInput',
                dropZoneId: 'faviconDropZone',
                statusId: 'faviconStatus',
                fileName: 'favicon.ico',
                previewId: 'faviconPreview',
                placeholderId: 'faviconPlaceholder',
                deleteId: 'faviconDelete',
                dimensionsId: 'faviconDimensions',
            },
            {
                inputId: 'bannerLightInput',
                dropZoneId: 'bannerLightDropZone',
                statusId: 'bannerLightStatus',
                fileName: 'banner-light.png',
                previewId: 'bannerLightPreview',
                placeholderId: 'bannerLightPlaceholder',
                deleteId: 'bannerLightDelete',
                dimensionsId: 'bannerLightDimensions',
            },
            {
                inputId: 'bannerDarkInput',
                dropZoneId: 'bannerDarkDropZone',
                statusId: 'bannerDarkStatus',
                fileName: 'banner-dark.png',
                previewId: 'bannerDarkPreview',
                placeholderId: 'bannerDarkPlaceholder',
                deleteId: 'bannerDarkDelete',
                dimensionsId: 'bannerDarkDimensions',
            },
            {
                inputId: 'touchiconInput',
                dropZoneId: 'touchiconDropZone',
                statusId: 'touchiconStatus',
                fileName: 'apple-touch-icon.png',
                previewId: 'touchiconPreview',
                placeholderId: 'touchiconPlaceholder',
                deleteId: 'touchiconDelete',
                dimensionsId: 'touchiconDimensions',
            },
        ];

        uploadConfigs.forEach((config) => {
            const input = document.getElementById(config.inputId);
            const dropZone = document.getElementById(config.dropZoneId);
            const statusDiv = document.getElementById(config.statusId);
            const deleteButton = document.getElementById(config.deleteId);

            if (!input || !dropZone || !statusDiv) return;

            // Handle file selection
            lifecycle.listen(input, 'change', (e) => {
                if (e.target.files.length > 0) {
                    uploadBrandingImage(e.target.files[0], config, statusDiv);
                }
            });

            // Drag and drop
            lifecycle.listen(dropZone, 'dragover', (e) => {
                e.preventDefault();
                dropZone.style.borderColor = 'var(--primary-accent-color, #00a4dc)';
                dropZone.style.backgroundColor =
                    'color-mix(in srgb, var(--primary-accent-color, #00a4dc) 10%, transparent)';
            });

            lifecycle.listen(dropZone, 'dragleave', (e) => {
                e.preventDefault();
                dropZone.style.borderColor =
                    'color-mix(in srgb, var(--primary-accent-color, #00a4dc) 50%, transparent)';
                dropZone.style.backgroundColor = 'rgba(255,255,255,0.05)';
            });

            lifecycle.listen(dropZone, 'drop', (e) => {
                e.preventDefault();
                dropZone.style.borderColor =
                    'color-mix(in srgb, var(--primary-accent-color, #00a4dc) 50%, transparent)';
                dropZone.style.backgroundColor = 'rgba(255,255,255,0.05)';
                if (e.dataTransfer.files.length > 0) {
                    uploadBrandingImage(e.dataTransfer.files[0], config, statusDiv);
                }
            });

            if (deleteButton) {
                lifecycle.listen(deleteButton, 'click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteBrandingImage(config, statusDiv);
                });
            }

            // Load existing preview if present
            refreshBrandingPreview(config);
        });
    }

    async function uploadBrandingImage(file, config, statusDiv) {
        const isCurrent = beginOperation(config);
        // Validate that it's an image file
        if (!file.type || !file.type.startsWith('image/')) {
            statusDiv.textContent = '✗ Only image files allowed';
            statusDiv.style.color = '#ff6b6b';
            return;
        }

        const maxFileSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxFileSize) {
            statusDiv.textContent = `✗ File too large (max ${maxFileSize / (1024 * 1024)}MB)`;
            statusDiv.style.color = '#ff6b6b';
            return;
        }

        // Show image preview and dimensions
        const previewImg = document.getElementById(config.previewId);
        const dimensionsDiv = document.getElementById(config.dimensionsId);
        const placeholder = document.getElementById(config.placeholderId);

        if (previewImg) {
            const objectUrl = URL.createObjectURL(file);
            previewImg.src = objectUrl;
            previewImg.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';

            // Get image dimensions
            previewImg.onload = function () {
                if (!isCurrent()) {
                    URL.revokeObjectURL(objectUrl);
                    return;
                }
                const img = new Image();
                img.onload = function () {
                    if (isCurrent() && dimensionsDiv) {
                        dimensionsDiv.textContent = `${img.width} × ${img.height}px`;
                        dimensionsDiv.style.display = 'block';
                    }
                    URL.revokeObjectURL(objectUrl);
                };
                img.src = objectUrl;
            };
        }

        statusDiv.textContent = 'Uploading...';
        statusDiv.style.color = '#ffa500';

        try {
            const formData = new FormData();
            const renamedFile = new File([file], config.fileName, { type: file.type });
            formData.append('file', renamedFile);
            formData.append('fileName', config.fileName);

            const token = ApiClient.accessToken ? ApiClient.accessToken() : '';
            const response = await fetch(ApiClient.getUrl('/JellyfinEnhanced/UploadBrandingImage'), {
                method: 'POST',
                body: formData,
                headers: {
                    // Jellyfin 12 authenticates from the Authorization header; the
                    // legacy X-MediaBrowser-Token is kept for 10.11 back-compat.
                    Authorization: 'MediaBrowser Token="' + token + '"',
                    'X-MediaBrowser-Token': token,
                },
            });

            if (!isCurrent()) return;
            if (response.ok) {
                statusDiv.textContent = '✓ Uploaded';
                statusDiv.style.color = '#51cf66';
                await refreshBrandingPreview(config, isCurrent);
                lifecycle.setTimeout(() => {
                    if (isCurrent()) statusDiv.textContent = '';
                }, 3000);
            } else {
                const error = await response.text();
                if (!isCurrent()) return;
                statusDiv.textContent = `✗ ${error || 'Upload failed'}`;
                statusDiv.style.color = '#ff6b6b';
            }
        } catch (error) {
            if (!isCurrent()) return;
            console.error('Upload exception:', error);
            statusDiv.textContent = `✗ ${error.message || 'Upload error'}`;
            statusDiv.style.color = '#ff6b6b';
        }
    }

    async function refreshBrandingPreview(config, isCurrent = beginOperation(config)) {
        if (!isCurrent()) return;
        const previewImg = document.getElementById(config.previewId);
        const placeholder = document.getElementById(config.placeholderId);
        const deleteButton = document.getElementById(config.deleteId);
        const dimensionsDiv = document.getElementById(config.dimensionsId);
        if (!previewImg) return;

        const token = ApiClient.accessToken ? ApiClient.accessToken() : '';
        try {
            const response = await fetch(
                ApiClient.getUrl('/JellyfinEnhanced/BrandingImage', { fileName: config.fileName, t: Date.now() }),
                {
                    // Jellyfin 12 authenticates from the Authorization header; the
                    // legacy X-MediaBrowser-Token is kept for 10.11 back-compat.
                    headers: { Authorization: 'MediaBrowser Token="' + token + '"', 'X-MediaBrowser-Token': token },
                },
            );

            if (!isCurrent()) return;
            if (!response.ok) {
                previewImg.style.display = 'none';
                if (placeholder) placeholder.style.display = 'block';
                if (deleteButton) deleteButton.style.display = 'none';
                if (dimensionsDiv) dimensionsDiv.style.display = 'none';
                return;
            }

            const blob = await response.blob();
            if (!isCurrent()) return;
            const objectUrl = URL.createObjectURL(blob);
            previewImg.src = objectUrl;
            previewImg.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
            if (deleteButton) deleteButton.style.display = 'inline-block';

            // Show dimensions for existing images
            if (dimensionsDiv) {
                previewImg.onload = function () {
                    if (!isCurrent()) return;
                    dimensionsDiv.textContent = previewImg.naturalWidth + ' × ' + previewImg.naturalHeight + 'px';
                    dimensionsDiv.style.display = 'block';
                };
            }
        } catch (err) {
            if (!isCurrent()) return;
            previewImg.style.display = 'none';
            if (placeholder) placeholder.style.display = 'block';
            if (deleteButton) deleteButton.style.display = 'none';
            if (dimensionsDiv) dimensionsDiv.style.display = 'none';
        }
    }

    async function deleteBrandingImage(config, statusDiv) {
        const isCurrent = beginOperation(config);
        statusDiv.textContent = 'Deleting...';
        statusDiv.style.color = '#ffa500';

        const formData = new FormData();
        formData.append('fileName', config.fileName);
        const token = ApiClient.accessToken ? ApiClient.accessToken() : '';

        try {
            const response = await fetch(ApiClient.getUrl('/JellyfinEnhanced/DeleteBrandingImage'), {
                method: 'POST',
                body: formData,
                // Jellyfin 12 authenticates from the Authorization header; the
                // legacy X-MediaBrowser-Token is kept for 10.11 back-compat.
                headers: { Authorization: 'MediaBrowser Token="' + token + '"', 'X-MediaBrowser-Token': token },
            });

            if (!isCurrent()) return;
            if (response.ok) {
                statusDiv.textContent = '✓ Deleted';
                statusDiv.style.color = '#51cf66';

                // Hide dimensions when image is deleted
                const dimensionsDiv = document.getElementById(config.dimensionsId);
                if (dimensionsDiv) dimensionsDiv.style.display = 'none';

                await refreshBrandingPreview(config, isCurrent);
                lifecycle.setTimeout(() => {
                    if (isCurrent()) statusDiv.textContent = '';
                }, 2000);
            } else {
                const error = await response.text();
                if (!isCurrent()) return;
                statusDiv.textContent = `✗ ${error || 'Delete failed'}`;
                statusDiv.style.color = '#ff6b6b';
            }
        } catch (err) {
            if (!isCurrent()) return;
            statusDiv.textContent = `✗ ${err.message || 'Delete error'}`;
            statusDiv.style.color = '#ff6b6b';
        }
    }

    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        setupBrandingUploads();
    }
    return { initialize, dispose: () => lifecycle.dispose() };
}
