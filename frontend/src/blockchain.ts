// Blockchain integration for tournament storage
// Backend handles all blockchain communication

export async function initBlockchain(): Promise<boolean> {
    // No initialization needed - backend handles it
    return true;
}

export async function saveTournamentToBlockchain(uuid: string, data: any): Promise<boolean> {
    try {
        console.log('💾 Saving tournament to blockchain...');
        
        const response = await fetch(`https://localhost/api/blockchain/tournament/${uuid}`, {
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
        console.log('📖 Reading tournament from blockchain...');
        
        const response = await fetch(`https://localhost/api/blockchain/tournament/${uuid}`, {
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

export async function tournamentExistsOnBlockchain(uuid: string): Promise<boolean> {
    try {
        const response = await fetch(`https://localhost/api/blockchain/tournament/${uuid}/exists`, {
            method: 'GET',
            credentials: 'include'
        });
        
        if (!response.ok) {
            return false;
        }
        
        const { exists, available } = await response.json();
        return available && exists;
    } catch (error) {
        console.error('Failed to check tournament existence:', error);
        return false;
    }
}
