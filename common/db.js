/**
 * Asset Database - Server API Version
 * Stores folders and images on server for cross-device sync
 */

const API_BASE = '/api';

class AssetDB {
    constructor() {
        this.cache = { folders: null, images: {} };
    }

    // --- Folder Operations ---

    async createFolder(name) {
        const res = await fetch(`${API_BASE}/folders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (!res.ok) throw new Error('Failed to create folder');
        this.cache.folders = null; // Invalidate cache
        return res.json();
    }

    async getFolders() {
        // Simple caching to reduce requests
        if (this.cache.folders) return this.cache.folders;

        const res = await fetch(`${API_BASE}/folders`);
        if (!res.ok) throw new Error('Failed to get folders');
        this.cache.folders = await res.json();
        return this.cache.folders;
    }

    async updateFolder(id, newName) {
        // Not implemented on server yet, but keep for compatibility
        console.warn('updateFolder not implemented on server');
        return { id, name: newName };
    }

    async deleteFolder(id) {
        const res = await fetch(`${API_BASE}/folders/${id}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Failed to delete folder');
        this.cache.folders = null;
        delete this.cache.images[id];
        return res.json();
    }

    // --- Image Operations ---

    async addImage(folderId, file) {
        const formData = new FormData();
        formData.append('images', file);

        const res = await fetch(`${API_BASE}/folders/${folderId}/images`, {
            method: 'POST',
            body: formData
        });
        if (!res.ok) throw new Error('Failed to upload image');
        delete this.cache.images[folderId]; // Invalidate cache
        const uploaded = await res.json();
        return uploaded[0]; // Return first image
    }

    async getImages(folderId) {
        // Check cache
        if (this.cache.images[folderId]) {
            return this.cache.images[folderId];
        }

        const res = await fetch(`${API_BASE}/folders/${folderId}/images`);
        if (!res.ok) throw new Error('Failed to get images');
        const images = await res.json();
        this.cache.images[folderId] = images;
        return images;
    }

    async deleteImage(id) {
        const res = await fetch(`${API_BASE}/images/${id}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Failed to delete image');
        // Clear all image caches (we don't know which folder)
        this.cache.images = {};
        return res.json();
    }

    async clearAllImagesInFolder(folderId) {
        const images = await this.getImages(folderId);
        for (const img of images) {
            await this.deleteImage(img.id);
        }
    }

    // Utility: Invalidate all caches
    invalidateCache() {
        this.cache = { folders: null, images: {} };
    }
}

const db = new AssetDB();
