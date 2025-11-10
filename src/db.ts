import Dexie from 'dexie';

export interface Team {
    id: string;
    displayName: string;
}

export interface Channel {
    id: string;
    displayName: string;
}

export interface FavoriteTeam {
    id: string;
    displayName: string;
    channels: Channel[];
}

export interface OfflinePost {
    id?: number;
    teamId: string;
    channelId: string;
    channelDisplayName: string;  // Neu hinzufügen
    text: string;
    imageUrls: string[];
    timestamp: number;
}

export class OfflineDB extends Dexie {
    favoriteTeams!: Dexie.Table<FavoriteTeam, string>;
    posts!: Dexie.Table<OfflinePost, number>;
    images!: Dexie.Table<{ id?: number; postId: number; file: File }, number>;  // Neue Tabelle für Bilder

    constructor() {
        super('offlineData');
        this.version(1).stores({
            favoriteTeams: 'id, displayName, channels',
            posts: '++id, teamId, channelId, text, imageUrls, timestamp',
            images: '++id, postId, file'  // Neue Store
        });
    }
}

export const db = new OfflineDB();