// Blockchain integration for tournament storage
// Backend handles all blockchain communication

export async function initBlockchain(): Promise<boolean> {
    // No initialization needed - backend handles it
    return true;
}

export async function saveTournamentToBlockchain(uuid: string, data: any): Promise<boolean> {
    try {
        console.log('💾 Saving tournament to blockchain:', uuid);
        
        const response = await fetch(`/api/blockchain/tournament/${uuid}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(data)
        });
        
        if (response.status === 409) {
            throw new Error('Tournament already saved to blockchain - cannot overwrite');
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to save: ${response.statusText}`);
        }
        
        console.log('✅ Tournament saved to blockchain!');
        return true;
    } catch (error) {
        console.error('Failed to save to blockchain:', error);
        throw error;
    }
}

export async function getTournamentFromBlockchain(uuid: string): Promise<any> {
    try {
        console.log('📖 Reading tournament from blockchain:', uuid);
        
        const response = await fetch(`/api/blockchain/tournament/${uuid}`, {
            method: 'GET',
            credentials: 'include'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to retrieve: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ Tournament loaded from blockchain!');
        return data;
    } catch (error) {
        console.error('Failed to read from blockchain:', error);
        throw error;
    }
}

export async function checkTournamentExistsOnBlockchain(uuid: string): Promise<{exists: boolean, available: boolean}> {
    try {
        const response = await fetch(`/api/blockchain/tournament/${uuid}/exists`, {
            method: 'GET',
            credentials: 'include'
        });
        
        if (!response.ok) {
            return { exists: false, available: false };
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Failed to check blockchain:', error);
        return { exists: false, available: false };
    }
}

