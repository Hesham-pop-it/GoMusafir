import * as SQLite from 'expo-sqlite';
import ChatEncryption from './chatEncryption';

/**
 * SQLite Database Manager for Offline Chat
 * Handles persistent storage of encrypted messages
 */
class ChatDatabase {
    static db = null;

    /**
     * Initializes the SQLite database and creates the messages table if it doesn't exist
     */
    static async init() {
        if (this.db) return;
        
        try {
            this.db = await SQLite.openDatabaseAsync('gomusafir_chat.db');
            
            // Initialize the encryption system
            await ChatEncryption.initialize();

            await this.db.execAsync(`
                PRAGMA journal_mode = WAL;
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    trip_id TEXT NOT NULL,
                    type TEXT,
                    sender_id TEXT,
                    sender_name TEXT,
                    avatar TEXT,
                    encrypted_text TEXT,
                    encrypted_media_url TEXT,
                    timestamp INTEGER,
                    reply_to_json TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_messages_trip_id ON messages (trip_id);
                CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages (timestamp);
            `);
            
            // console.log('Chat Database initialized successfully');
        } catch (error) {
            console.error('SQLite Initialization Error:', error);
        }
    }

    /**
     * Saves a message to the local database (Encrypts before saving)
     */
    static async saveMessage(tripId, msg) {
        if (!this.db) await this.init();

        try {
            const encryptedText = ChatEncryption.encrypt(msg.text || '');
            const mediaUrl = msg.image_url || msg.audio_url || msg.media_url || '';
            const encryptedMediaUrl = ChatEncryption.encrypt(mediaUrl);
            const replyToJson = msg.replyTo ? JSON.stringify(msg.replyTo) : null;

            await this.db.runAsync(
                `INSERT OR REPLACE INTO messages 
                (id, trip_id, type, sender_id, sender_name, avatar, encrypted_text, encrypted_media_url, timestamp, reply_to_json) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    msg.id,
                    tripId,
                    msg.type || 'text',
                    msg.sender_id,
                    msg.sender_name,
                    msg.avatar || '',
                    encryptedText,
                    encryptedMediaUrl,
                    msg.timestamp || Date.now(),
                    replyToJson
                ]
            );
        } catch (error) {
            console.error('Error saving message to SQLite:', error);
        }
    }

    /**
     * Loads messages for a specific trip (Decrypts after loading)
     */
    static async getMessages(tripId, limit = 50) {
        if (!this.db) await this.init();

        try {
            const rows = await this.db.getAllAsync(
                'SELECT * FROM messages WHERE trip_id = ? ORDER BY timestamp DESC LIMIT ?',
                [tripId, limit]
            );

            return rows.map(row => {
                const mediaUrl = ChatEncryption.decrypt(row.encrypted_media_url);
                const msg = {
                    id: row.id,
                    type: row.type,
                    sender_id: row.sender_id,
                    sender_name: row.sender_name,
                    avatar: row.avatar,
                    text: ChatEncryption.decrypt(row.encrypted_text),
                    timestamp: row.timestamp,
                    replyTo: row.reply_to_json ? JSON.parse(row.reply_to_json) : null,
                };

                // Restore media field based on type
                if (row.type === 'image') msg.image_url = mediaUrl;
                else if (row.type === 'voice') msg.audio_url = mediaUrl;
                else if (mediaUrl) msg.media_url = mediaUrl;

                return msg;
            });
        } catch (error) {
            console.error('Error loading messages from SQLite:', error);
            return [];
        }
    }

    /**
     * Deletes all messages for a specific trip
     */
    static async clearChat(tripId) {
        if (!this.db) await this.init();
        try {
            await this.db.runAsync('DELETE FROM messages WHERE trip_id = ?', [tripId]);
        } catch (error) {
            console.error('Error clearing chat from SQLite:', error);
        }
    }
}

export default ChatDatabase;
