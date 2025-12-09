import Dexie from 'dexie';

export interface Team {
    id: string;
    displayName: string;
}

export interface Channel {
    id: string;
    displayName: string;
}

export interface DBMentionUser {
    id: string;
    displayName: string;
}

export interface SubFolder {
    id: string;
    name: string;
}

export interface FavoriteTeam {
    id: string;
    displayName: string;
    channels: Channel[];
    members?: DBMentionUser[];
    // NEW: Map channelId -> SubFolder[]
    channelSubFolders?: { [channelId: string]: SubFolder[] };
}

export interface OfflinePost {
    id?: number;
    teamId: string;
    channelId: string;
    channelDisplayName: string;
    text: string;
    imageUrls: string[];
    timestamp: number;
    mentions?: DBMentionUser[];
    subFolder?: string; // Added subFolder field
}

export class OfflineDB extends Dexie {
    favoriteTeams!: Dexie.Table<FavoriteTeam, string>;
    posts!: Dexie.Table<OfflinePost, number>;
    images!: Dexie.Table<{ id?: number; postId: number; file: File }, number>;

    constructor() {
        super('offlineData');
        
        // Version 1 (alt)
        this.version(1).stores({
            favoriteTeams: 'id, displayName, channels',
            posts: '++id, teamId, channelId, text, imageUrls, timestamp',
            images: '++id, postId, file'
        });

        // Version 2 (neu): 'members' zum Index hinzufügen
        // Dexie führt automatisch ein Upgrade durch
        this.version(2).stores({
            favoriteTeams: 'id, displayName, channels, members', 
            posts: '++id, teamId, channelId, text, imageUrls, timestamp',
            images: '++id, postId, file'
        });

        // Version 3 (neu): 'channelSubFolders' hinzufügen
        this.version(3).stores({
            favoriteTeams: 'id, displayName, channels, members, channelSubFolders', 
            posts: '++id, teamId, channelId, text, imageUrls, timestamp',
            images: '++id, postId, file'
        });
    }
}

export const db = new OfflineDB();