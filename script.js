// Game State
let state = {
    emeralds: 1000,
    inventory: [], 
    isOpening: false
};

const config = window.CARD_CONFIG || { rarity_settings: {}, cards: [] };
const cards = config.cards;
const raritySettings = config.rarity_settings;

// --- FIREBASE LOGIC ---
auth.onAuthStateChanged(async (user) => {
    const authWall = document.getElementById('auth-wall');
    const gameApp = document.getElementById('game-app');
    const authError = document.getElementById('auth-error');

    if (user) {
        // VERIFICATION BANNISSEMENT
        const banDoc = await db.collection('banned_users').doc(user.uid).get();
        if (banDoc.exists) {
            if (authError) {
                authError.textContent = "Accès refusé : Ce compte a été banni pour non-respect des règles.";
                authError.style.display = 'block';
            }
            auth.signOut();
            return;
        }

        if (authError) authError.style.display = 'none';
        
        // Afficher l'état de chargement dans le mur
        document.getElementById('user-logged-out').style.display = 'none';
        document.getElementById('user-logged-in').style.display = 'block';
        
        await loadCloudState(user.uid);
        
        // Afficher l'email et débloquer le jeu
        document.getElementById('user-display-email').textContent = user.email;
        authWall.style.display = 'none';
        gameApp.style.display = 'block';

        // VERIFICATION ADMIN
        if (user.email === 'hellosuperordi@gmail.com') {
            const nav = document.querySelector('nav');
            if (!document.getElementById('nav-admin')) {
                const adminBtn = document.createElement('button');
                adminBtn.id = 'nav-admin';
                adminBtn.textContent = 'ADMIN';
                adminBtn.style.background = '#c0392b';
                adminBtn.onclick = renderAdminView;
                nav.appendChild(adminBtn);
            }
        }
    } else {
        // Bloquer le jeu et afficher le mur
        authWall.style.display = 'flex';
        gameApp.style.display = 'none';
        document.getElementById('user-logged-out').style.display = 'block';
        document.getElementById('user-logged-in').style.display = 'none';
        
        // Reset state local
        state = { emeralds: 1000, inventory: [], isOpening: false };
        updateUI();
    }
});

async function loadCloudState(uid) {
    try {
        const doc = await db.collection('users').doc(uid).get();
        if (doc.exists) {
            state = doc.data();
            state.isOpening = false;
        } else {
            // New user, save current local state to cloud
            await saveCloudState(uid);
        }
        updateUI();
        renderInventory();
    } catch (e) {
        console.error("Error loading cloud state:", e);
    }
}

async function saveCloudState(uid) {
    try {
        const user = auth.currentUser;
        await db.collection('users').doc(uid).set({
            ...state,
            email: user ? user.email : "Email inconnu"
        });
    } catch (e) {
        console.error("Error saving to cloud:", e);
    }
}

window.signUp = () => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    auth.createUserWithEmailAndPassword(email, pass).catch(e => alert(e.message));
};

window.login = () => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    auth.signInWithEmailAndPassword(email, pass).catch(e => alert(e.message));
};

window.togglePasswordVisibility = () => {
    const passInput = document.getElementById('auth-password');
    const toggleIcon = document.getElementById('toggle-password');
    if (passInput.type === 'password') {
        passInput.type = 'text';
        toggleIcon.textContent = '🔒';
    } else {
        passInput.type = 'password';
        toggleIcon.textContent = '👁️';
    }
};

window.forgotPassword = () => {
    const email = document.getElementById('auth-email').value;
    if (!email) {
        alert("Veuillez d'abord saisir votre adresse email dans le champ Email pour recevoir le lien de réinitialisation.");
        return;
    }
    auth.sendPasswordResetEmail(email)
        .then(() => alert("Email envoyé ! Vérifiez votre boîte de réception (et vos spams) pour réinitialiser votre mot de passe."))
        .catch(e => alert(e.message));
};

window.logout = () => {
    auth.signOut();
};
// ----------------------

function saveState() {
    localStorage.setItem('minecraftCardCollectionState_v5', JSON.stringify(state));
    const user = auth.currentUser;
    if (user) saveCloudState(user.uid);
    updateUI();
}

function getCardRarity(card) {
    if (card.rarity_override !== undefined) return card.rarity_override;
    return raritySettings[card.type] || 1;
}

function updateUI() {
    const emEl = document.getElementById('emeralds-count');
    const boEl = document.getElementById('boosters-count');
    if (emEl) emEl.textContent = state.emeralds;
    if (boEl) boEl.textContent = `Boosters: ∞`;
}

function getInventoryCounts() {
    const counts = {};
    state.inventory.forEach(item => {
        counts[item.id] = (counts[item.id] || 0) + 1;
    });
    return counts;
}

function renderInventory() {
    if (state.isOpening) return;
    document.getElementById('sort-controls').style.display = 'block';
    const content = document.getElementById('content');
    content.innerHTML = '<div class="card-grid"></div>';
    const grid = content.querySelector('.card-grid');

    const counts = getInventoryCounts();
    let displayList = [];
    const uniqueIds = [...new Set(state.inventory.map(i => i.id))];
    
    uniqueIds.forEach(id => {
        const cardData = cards.find(c => c.id === id);
        if (cardData) {
            const items = state.inventory.filter(i => i.id === id);
            const lastObtained = items.length > 0 ? Math.max(...items.map(i => i.obtainedAt)) : 0;
            const rarity = getCardRarity(cardData);
            displayList.push({ ...cardData, count: counts[id], lastObtained, actual_rarity: rarity });
        }
    });

    const sortType = document.getElementById('sort-select').value;
    if (sortType === 'rarity') {
        displayList.sort((a, b) => {
            if (b.actual_rarity !== a.actual_rarity) return b.actual_rarity - a.actual_rarity;
            if (a.category !== b.category) return a.category === 'Blocks' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    } else if (sortType === 'date') {
        displayList.sort((a, b) => b.lastObtained - a.lastObtained);
    } else if (sortType === 'name') {
        displayList.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (displayList.length === 0) {
        content.innerHTML = '<p style="text-align:center; padding: 50px;">Votre inventaire est vide.</p>';
        return;
    }

    displayList.forEach(card => {
        grid.appendChild(createCardElement(card, true, card.count));
    });
}

function renderIndex() {
    if (state.isOpening) return;
    document.getElementById('sort-controls').style.display = 'none';
    const content = document.getElementById('content');
    content.innerHTML = '';

    const counts = getInventoryCounts();
    const ownedUnique = Object.keys(counts).length;
    const totalUnique = cards.length;

    const statsContainer = document.createElement('div');
    statsContainer.className = 'collection-stats';
    statsContainer.innerHTML = `Complétion : <span>${ownedUnique} / ${totalUnique}</span> cards`;
    content.appendChild(statsContainer);

    const categories = ['Blocks', 'Outils', 'Items', 'Musique', 'Secret'];

    categories.forEach(cat => {
        const catTitle = document.createElement('h2');
        catTitle.className = 'section-title';
        catTitle.textContent = cat;
        content.appendChild(catTitle);

        const grid = document.createElement('div');
        grid.className = 'card-grid';
        content.appendChild(grid);

        const catCards = cards.filter(c => c.category === cat);
        const sortedCards = [...catCards].sort((a, b) => getCardRarity(b) - getCardRarity(a) || a.name.localeCompare(b.name));

        sortedCards.forEach(card => {
            const count = counts[card.id] || 0;
            const isOwned = count > 0;
            const cardEl = createCardElement(card, isOwned, count);
            if (!isOwned) cardEl.classList.add('locked');
            grid.appendChild(cardEl);
        });
    });
}

function createCardElement(card, isOwned, count = 0) {
    const rarity = getCardRarity(card);
    const cardEl = document.createElement('div');
    const rarityClass = `rarity-${rarity.toString().replace('.', '-')}`;
    cardEl.className = `card ${rarityClass}`;
    
    if (isOwned) {
        if (card.type === 'gold') cardEl.classList.add('effect-gold');
        if (card.type === 'red_gold') cardEl.classList.add('effect-red-gold');
        if (card.type === 'immersive') cardEl.classList.add('effect-immersive');
        if (card.type === 'secret') {
            if (card.id === '199') {
                cardEl.classList.add('card-secret-gold');
            } else {
                cardEl.classList.add('effect-secret'); // L'ancien effet pour l'autre secrète
            }
        }
    }

    let innerHTML = `<div class="card-name">${card.name}</div>`;

    if (card.is_item) {
        innerHTML += `
            <div class="card-image-container item-view">
                <img src="cards_images/${card.item_asset}" class="mc-item" alt="${card.name}">
            </div>
        `;
    } else {
        innerHTML += `
            <div class="card-image-container">
                <div class="mc-block">
                    <div class="mc-face top" style="background-image: url('cards_images/${card.top}')"></div>
                    <div class="mc-face right" style="background-image: url('cards_images/${card.side}')"></div>
                    <div class="mc-face left" style="background-image: url('cards_images/${card.side}')"></div>
                </div>
            </div>
        `;
    }

    innerHTML += `${isOwned && count > 1 ? `<div class="card-quantity">x${count}</div>` : ''}`;
    cardEl.innerHTML = innerHTML;
    
    if (card.type === 'secret' && card.id !== '199') { // Ne pas activer l'effet glitch pour le lingot d'or
        cardEl.addEventListener('mouseenter', startSecretHack);
        cardEl.addEventListener('mouseleave', stopSecretHack);
    }

    return cardEl;
}

function startSecretHack() {
    document.body.classList.add('secret-hack-active');
    const container = document.getElementById('fullscreen-fireworks');
    if (!container) return;
    
    container.innerHTML = '';
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'firework-particle';
        p.style.left = Math.random() * 100 + 'vw';
        p.style.top = Math.random() * 100 + 'vh';
        p.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 50%)`;
        p.style.animationDelay = Math.random() * 2 + 's';
        container.appendChild(p);
    }
}

function stopSecretHack() {
    document.body.classList.remove('secret-hack-active');
}

// BOOSTER LOGIC
function openBooster(skipSuspense = false) {
    if (state.isOpening) return;

    state.isOpening = true;
    // state.boosters--; // Désormais infini
    updateUI();
    
    const btn = document.getElementById('open-booster-btn');
    const container = document.getElementById('booster-results');
    const controls = document.getElementById('booster-controls');
    
    const oldGodTitle = document.getElementById('god-pack-title');
    if (oldGodTitle) oldGodTitle.remove();

    container.innerHTML = '';
    controls.innerHTML = '';

    if (skipSuspense) {
        if (btn) btn.style.display = 'none';
        startBoosterReveal(container, controls);
    } else {
        if (btn) {
            btn.style.display = 'flex';
            btn.classList.add('shaking');
        }
        setTimeout(() => {
            if (btn) {
                btn.classList.remove('shaking');
                btn.style.display = 'none';
            }
            startBoosterReveal(container, controls);
        }, 1200);
    }
}

function startBoosterReveal(container, controls) {
    const results = [];
    const now = Date.now();
    
    const isGodPack = Math.random() < 0.001;
    if (isGodPack) {
        console.log("!!! GOD PACK !!!");
        const godPackTitle = document.createElement('h2');
        godPackTitle.id = 'god-pack-title';
        godPackTitle.innerHTML = "✨ GOD PACK !!! ★";
        godPackTitle.style.color = "#ffeb3b";
        godPackTitle.style.textShadow = "0 0 20px #ffea00";
        container.before(godPackTitle);
    }

    let redGoldInPack = 0;
    while (results.length < 5) {
        let cardId;
        const rand = Math.random() * 100;
        const i = results.length;

        if (isGodPack) {
            let godRands = [4, 4.5, 5];
            if (redGoldInPack < 1) godRands.push(6);
            const targetRarity = godRands[Math.floor(Math.random() * godRands.length)];
            cardId = getRandomByActualRarity(targetRarity);
            if (cardId && cards.find(c => c.id === cardId).type === 'red_gold') redGoldInPack++;
        } else {
            if (i < 4) cardId = rand < 70 ? getRandomByActualRarity(1) : getRandomByActualRarity(2);
            else {
                const r = Math.random() * 100;
                if (r < 0.2) cardId = getRandomByActualRarity(6); // Red Gold (1/500)
                else if (r < 1.2) cardId = getRandomByActualRarity(5); // Gold (1%)
                else if (r < 6.2) cardId = getRandomByActualRarity(4.5); // Immersive (5%)
                else if (r < 16.2) cardId = getRandomByActualRarity(4.2); // Epic (10%)
                else if (r < 36.2) cardId = getRandomByActualRarity(3); // Rare (20%)
                else cardId = getRandomByActualRarity(2);
            }
        }
        if (cardId && !results.includes(cardId)) results.push(cardId);
    }

    results.forEach((id, index) => {
        setTimeout(() => {
            const card = cards.find(c => c.id === id);
            if (card) {
                const cardEl = createCardElement(card, true, 0);
                const rarity = getCardRarity(card);

                // --- CINEMATIC REVEAL LOGIC ---
                if (rarity >= 6) {
                    // RED GOLD: Impact Total
                    cardEl.classList.add('red-gold-reveal');
                    triggerFlash('flash-red');
                    document.body.classList.add('shake-screen');
                    setTimeout(() => document.body.classList.remove('shake-screen'), 500);
                } else if (rarity >= 5) {
                    // GOLD: Explosion Solaire
                    cardEl.classList.add('gold-reveal');
                    triggerFlash('flash-gold');
                } else if (rarity >= 4.5) {
                    // IMMERSIVE: Tremblement Intense
                    cardEl.classList.add('epic-shake');
                    triggerFlash('flash-white');
                } else if (rarity >= 3) {
                    // RARE / EPIC: Flash Standard
                    cardEl.classList.add('reveal-anim');
                    triggerFlash('flash-white');
                } else {
                    // COMMON: Révélation Normale
                    cardEl.classList.add('reveal-anim');
                }

                container.appendChild(cardEl);
                new Audio('cards_images/pop.wav').play().catch(() => {});
            }
            if (index === 4) {
                setTimeout(() => {
                    state.isOpening = false;
                    controls.innerHTML = `<button id="open-another-btn">Ouvrir un autre Pack (∞)</button>`;
                    document.getElementById('open-another-btn').onclick = () => openBooster(true);
                }, 1500);
            }
        }, index * 800);
        state.inventory.push({ id: id, obtainedAt: now });
    });
    saveState();
}

function triggerFlash(type = 'flash-white') {
    const flash = document.getElementById('screen-flash');
    if (flash) {
        flash.className = 'rare-flash ' + type;
        void flash.offsetWidth; // Reset animation
    }
}

function getRandomByActualRarity(level) {
    let possible = cards.filter(c => Math.floor(getCardRarity(c)) === Math.floor(level) && c.obtainable !== false);
    if (possible.length === 0) possible = cards.filter(c => c.obtainable !== false); 
    return possible.length > 0 ? possible[Math.floor(Math.random() * possible.length)].id : null;
}

function renderBoosterView() {
    state.isOpening = false;
    document.getElementById('sort-controls').style.display = 'none';
    const content = document.getElementById('content');
    content.innerHTML = `
        <div id="booster-view">
            <h2>Ouverture de Booster</h2>
            <div class="booster-pack" id="open-booster-btn">PACK MINECRAFT<br>Ouvrir</div>
            <div class="opened-cards" id="booster-results"></div>
            <div id="booster-controls"></div>
        </div>
    `;
    document.getElementById('open-booster-btn').onclick = () => openBooster(false);
}

// --- NEW CRAFTING SYSTEM ---
let craftingSlots = Array(9).fill(null);

function renderCraftView() {
    if (state.isOpening) return;
    document.getElementById('sort-controls').style.display = 'none';
    const content = document.getElementById('content');
    content.innerHTML = `
        <div id="craft-view">
            <h2>Table de Craft</h2>
            <div class="crafting-gui">
                <div class="craft-grid-3x3">
                    ${craftingSlots.map((card, i) => `
                        <div class="mc-slot" onclick="removeCardFromCraft(${i})">
                            ${card ? renderOnlyIcon(card) : ''}
                        </div>
                    `).join('')}
                </div>
                <div class="craft-arrow">➡</div>
                <div class="result-slot-container">
                    <div class="mc-slot large" id="craft-result"></div>
                    <button id="craft-btn" disabled onclick="performCraft()">CRAFTER</button>
                </div>
            </div>
            <div class="inventory-section">
                <div class="inventory-header">
                    <h3>Choisissez 9 cartes de même rareté</h3>
                </div>
                <div class="inventory-grid-scroll" id="craft-picker">
                    <!-- Cards will be injected here -->
                </div>
            </div>
        </div>
    `;
    updateCraftPicker();
    checkCraftPossible();
}

function renderOnlyIcon(card) {
    const rarity = getCardRarity(card);
    const rarityClass = `rarity-${rarity.toString().replace('.', '-')}`;
    return `<div class="mc-slot-item ${rarityClass}">
        <div class="card-image-container ${card.is_item ? 'item-view' : ''}">
            ${card.is_item ? `<img src="cards_images/${card.item_asset}" class="mc-item">` : `
                <div class="mc-block">
                    <div class="mc-face top" style="background-image: url('cards_images/${card.top}')"></div>
                    <div class="mc-face right" style="background-image: url('cards_images/${card.side}')"></div>
                    <div class="mc-face left" style="background-image: url('cards_images/${card.side}')"></div>
                </div>
            `}
        </div>
    </div>`;
}

function updateCraftPicker() {
    const picker = document.getElementById('craft-picker');
    if (!picker) return;
    const oldScroll = picker.scrollTop;
    const counts = getInventoryCounts();
    
    // Get unique owned cards that are not Secret
    let uniqueOwned = [...new Set(state.inventory.map(i => i.id))]
        .map(id => cards.find(c => c.id === id))
        .filter(c => c.type !== 'secret');
    
    // Sort by rarity
    uniqueOwned.sort((a, b) => getCardRarity(a) - getCardRarity(b) || a.name.localeCompare(b.name));

    picker.innerHTML = uniqueOwned.map(card => {
        const inGrid = craftingSlots.filter(s => s && s.id === card.id).length;
        const available = counts[card.id] - inGrid;
        if (available <= 0) return '';
        
        return `
            <div class="mini-item-pick rarity-${getCardRarity(card).toString().replace('.', '-')}" onclick="addCardToCraft('${card.id}')">
                ${renderOnlyIcon(card)}
                <div class="card-quantity">x${available}</div>
            </div>
        `;
    }).join('');
    picker.scrollTop = oldScroll;
}

window.addCardToCraft = (cardId) => {
    const picker = document.getElementById('craft-picker');
    const scrollPos = picker ? picker.scrollTop : 0; // Sauvegarde du scroll

    const card = cards.find(c => c.id === cardId);
    const emptyIndex = craftingSlots.findIndex(s => s === null);
    if (emptyIndex !== -1) {
        craftingSlots[emptyIndex] = card;
        
        // On ne met à jour que les parties dynamiques
        updateCraftGrid();
        updateCraftPicker();
        
        // Restauration du scroll
        const newPicker = document.getElementById('craft-picker');
        if (newPicker) newPicker.scrollTop = scrollPos;
    }
};

window.removeCardFromCraft = (index) => {
    const picker = document.getElementById('craft-picker');
    const scrollPos = picker ? picker.scrollTop : 0;

    if (craftingSlots[index]) {
        craftingSlots[index] = null;
        updateCraftGrid();
        updateCraftPicker();
        
        const newPicker = document.getElementById('craft-picker');
        if (newPicker) newPicker.scrollTop = scrollPos;
    }
};

function updateCraftGrid() {
    const grid = document.querySelector('.craft-grid-3x3');
    if (!grid) return;
    grid.innerHTML = craftingSlots.map((card, i) => `
        <div class="mc-slot" onclick="removeCardFromCraft(${i})">
            ${card ? renderOnlyIcon(card) : ''}
        </div>
    `).join('');
    checkCraftPossible();
}

function checkCraftPossible() {
    const btn = document.getElementById('craft-btn');
    if (!btn) return;
    const filled = craftingSlots.filter(s => s !== null);
    if (filled.length === 9) {
        const firstRarity = getCardRarity(filled[0]);
        const allSameRarity = filled.every(s => getCardRarity(s) === firstRarity);
        if (allSameRarity && firstRarity < 7) {
            btn.disabled = false;
            return;
        }
    }
    btn.disabled = true;
}

window.performCraft = () => {
    const gui = document.querySelector('.crafting-gui');
    const btn = document.getElementById('craft-btn');
    const resultSlot = document.getElementById('craft-result');
    
    if (!gui || !btn) return;

    const filled = craftingSlots.filter(s => s !== null);
    const baseRarity = getCardRarity(filled[0]);
    
    // Désactiver l'interface et la navigation pendant l'animation
    btn.disabled = true;
    state.isOpening = true; 
    gui.classList.add('is-crafting');

    // Déterminer la récompense à l'avance
    const nextRarityMap = { 1: 2, 2: 3, 3: 4, 4: 4.5, 4.5: 5, 5: 6, 6: 7 };
    const nextRarity = nextRarityMap[baseRarity] || baseRarity;
    const possibleReward = cards.filter(c => getCardRarity(c) === nextRarity);
    const reward = possibleReward[Math.floor(Math.random() * possibleReward.length)];

    // Lancer l'animation
    setTimeout(() => {
        // Supprimer les items de l'inventaire
        filled.forEach(card => {
            const idx = state.inventory.findIndex(i => i.id === card.id);
            if (idx !== -1) state.inventory.splice(idx, 1);
        });

        // Ajouter la récompense
        state.inventory.push({ id: reward.id, obtainedAt: Date.now() });
        craftingSlots = Array(9).fill(null);
        saveState();

        // Afficher le résultat avec l'animation de pop
        gui.classList.remove('is-crafting');
        updateCraftGrid(); // Vide la grille 3x3
        
        resultSlot.innerHTML = renderOnlyIcon(reward);
        resultSlot.classList.add('result-reveal');
        new Audio('cards_images/pop.wav').play().catch(() => {});

        setTimeout(() => {
            resultSlot.classList.remove('result-reveal');
            state.isOpening = false; // Réactiver la navigation
            renderCraftView(); // Tout rafraîchir proprement
        }, 3000); // Laisse 3s pour admirer la carte avant reset
        
    }, 800); // Durée de l'animation de fusion
};

async function renderAdminView() {
    if (auth.currentUser?.email !== 'hellosuperordi@gmail.com') return;
    
    document.getElementById('sort-controls').style.display = 'none';
    const content = document.getElementById('content');
    content.innerHTML = `
        <div id="admin-view" style="padding: 20px; background: #111; border: 4px solid #c0392b;">
            <h2 style="color: #c0392b;">PANNEAU D'ADMINISTRATION</h2>
            <div style="background: #222; padding: 20px; margin-bottom: 20px;">
                <h3>Mes Actions (Admin)</h3>
                <button onclick="adminGiveAllCards()">Se donner TOUTES les cartes</button>
                <button onclick="adminResetSelf()" style="background: #e67e22;">Réinitialiser MA collection</button>
            </div>
            
            <div style="background: #222; padding: 20px;">
                <h3>Gestion des Joueurs</h3>
                <div id="admin-user-list">Chargement des joueurs...</div>
            </div>
        </div>
    `;

    // Charger la liste des utilisateurs et des bannis
    const [usersSnapshot, bansSnapshot] = await Promise.all([
        db.collection('users').get(),
        db.collection('banned_users').get()
    ]);
    
    const bannedIds = new Set();
    bansSnapshot.forEach(doc => bannedIds.add(doc.id));

    const listEl = document.getElementById('admin-user-list');
    listEl.innerHTML = '';
    
    // Préparer les options de cartes pour le sélecteur
    const cardOptions = cards
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(c => `<option value="${c.id}">${c.name}</option>`)
        .join('');

    usersSnapshot.forEach(doc => {
        const userData = doc.data();
        const userId = doc.id;
        const userEmail = userData.email || "(Email inconnu)";
        
        // SECURITÉ : Ne pas s'afficher soi-même pour éviter de se bannir
        if (userEmail === 'hellosuperordi@gmail.com') return;

        const isBanned = bannedIds.has(userId);
        
        const userRow = document.createElement('div');
        userRow.style = "display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid #444; padding: 15px 0;";
        userRow.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: ${isBanned ? '#ff4d4d' : '#fff'}; font-weight: ${isBanned ? 'bold' : 'normal'};">
                    ${userEmail} ${isBanned ? '[BANNI]' : ''} (${userData.emeralds || 0} 💎)
                </span>
                <div style="display: flex; gap: 5px; align-items: center;">
                    <input type="number" id="admin-emerald-amount-${userId}" value="0" style="width: 70px; padding: 5px; background: #333; color: white; border: 1px solid #555;">
                    <button onclick="adminGiveEmeralds('${userId}')" style="background: #27ae60;">+ 💎</button>
                    ${isBanned ? 
                        `<button onclick="adminUnbanUser('${userId}', '${userEmail}')" style="background: #2ecc71;">DÉBANNIR</button>` : 
                        `<button onclick="adminBanUser('${userId}', '${userEmail}')" style="background: #e74c3c;">BANNIR</button>`
                    }
                    <button onclick="adminResetUser('${userId}')" style="background: #7f8c8d;">RESET</button>
                </div>
            </div>
            <div style="display: flex; gap: 10px; align-items: center; background: #222; padding: 10px;">
                <label style="font-size: 0.8rem; color: #aaa;">Donner une carte :</label>
                <select id="admin-card-select-${userId}" style="flex: 1; padding: 5px; background: #333; color: white; border: 1px solid #555;">
                    ${cardOptions}
                </select>
                <button onclick="adminGiveSpecificCard('${userId}')" style="background: #3498db; padding: 5px 15px;">ENVOYER</button>
            </div>
        `;
        listEl.appendChild(userRow);
    });
}

window.adminGiveSpecificCard = async (uid) => {
    const cardId = document.getElementById(`admin-card-select-${uid}`).value;
    const card = cards.find(c => c.id === cardId);
    if (!card) return;

    const ref = db.collection('users').doc(uid);
    const doc = await ref.get();
    if (doc.exists) {
        const inv = doc.data().inventory || [];
        inv.push({ id: card.id, obtainedAt: Date.now() });
        await ref.update({ inventory: inv });
        alert(`Carte "${card.name}" envoyée à l'utilisateur !`);
    }
};

window.adminUnbanUser = async (uid, email) => {
    if (confirm(`Voulez-vous vraiment débannir ${email} ?`)) {
        await db.collection('banned_users').doc(uid).delete();
        alert("Utilisateur débanni !");
        renderAdminView();
    }
};

window.adminGiveAllCards = () => {
    const now = Date.now();
    cards.forEach(c => state.inventory.push({ id: c.id, obtainedAt: now }));
    saveState();
    alert("Toutes les cartes ajoutées !");
    renderInventory();
};

window.adminResetSelf = () => {
    if (confirm("Reset TA collection ?")) {
        state.inventory = []; state.emeralds = 1000;
        saveState();
        renderInventory();
    }
};

window.adminGiveEmeralds = async (uid) => {
    const amountInput = document.getElementById(`admin-emerald-amount-${uid}`);
    const amount = parseInt(amountInput.value);
    
    if (isNaN(amount) || amount === 0) {
        alert("Veuillez saisir un montant valide.");
        return;
    }

    const ref = db.collection('users').doc(uid);
    const doc = await ref.get();
    if (doc.exists) {
        const data = doc.data();
        await ref.update({ emeralds: (data.emeralds || 0) + amount });
        alert(`${amount} émeraudes envoyées !`);
        renderAdminView();
    }
};

window.adminGiveRandomCard = async (uid) => {
    const card = cards[Math.floor(Math.random() * cards.length)];
    const ref = db.collection('users').doc(uid);
    const doc = await ref.get();
    if (doc.exists) {
        const inv = doc.data().inventory || [];
        inv.push({ id: card.id, obtainedAt: Date.now() });
        await ref.update({ inventory: inv });
        alert(`Carte ${card.name} donnée !`);
        renderAdminView();
    }
};

window.adminResetUser = async (uid) => {
    if (confirm("Réinitialiser ce joueur ?")) {
        await db.collection('users').doc(uid).update({
            inventory: [], emeralds: 1000
        });
        alert("Joueur réinitialisé !");
        renderAdminView();
    }
};

window.adminBanUser = async (uid, email) => {
    if (confirm(`Voulez-vous vraiment bannir ${email} ?`)) {
        await db.collection('banned_users').doc(uid).set({ email, bannedAt: Date.now() });
        alert("Utilisateur banni !");
        renderAdminView();
    }
};

// --- TRADE SYSTEM LOGIC ---
let activeTradeListener = null;

async function renderTradeView() {
    if (state.isOpening) return;
    if (activeTradeListener) { activeTradeListener(); activeTradeListener = null; }

    document.getElementById('sort-controls').style.display = 'none';
    const content = document.getElementById('content');
    const user = auth.currentUser;
    if (!user) return;

    content.innerHTML = `
        <div id="trade-view">
            <h2 style="text-align:center; color: var(--gold-vibrant);">Système d'Échange</h2>
            
            <div style="background: #222; padding: 20px; border: 4px solid #444; border-radius: 8px; margin-bottom: 20px;">
                <h3>Initier un nouvel échange</h3>
                <div style="display: flex; gap: 10px;">
                    <input type="email" id="trade-target-email" placeholder="Email du joueur..." style="flex: 1; padding: 10px; background: #111; color: white; border: 2px solid #555;">
                    <button onclick="startTradeWithEmail()" style="background: #3498db;">Envoyer Demande</button>
                </div>
            </div>

            <div class="trade-sections">
                <div class="trade-card-list">
                    <h3>Demandes Reçues</h3>
                    <div id="received-trades">Chargement...</div>
                </div>
                <div class="trade-card-list">
                    <h3>Mes Demandes Envoyées</h3>
                    <div id="sent-trades">Chargement...</div>
                </div>
            </div>
        </div>
    `;

    // Listen for trades involving the current user
    const ref = db.collection('trades');
    
    // Received trades
    db.collection('trades')
        .where('receiverId', '==', user.uid)
        .where('status', 'in', ['pending', 'active'])
        .onSnapshot(snap => {
            const list = document.getElementById('received-trades');
            if (!list) return;
            if (snap.empty) { list.innerHTML = "<p>Aucune demande reçue.</p>"; return; }
            list.innerHTML = "";
            snap.forEach(doc => {
                const data = doc.data();
                const div = document.createElement('div');
                div.className = "trade-request-item";
                const label = data.status === 'active' ? "EN COURS" : "NOUVEAU";
                div.innerHTML = `
                    <span><b>${data.senderEmail}</b> (${label})</span>
                    <div class="actions">
                        ${data.status === 'active' ? 
                            `<button style="background:#2ecc71;" onclick="renderActiveTrade('${doc.id}')">REJOINDRE</button>` : 
                            `<button class="btn-accept" onclick="acceptTradeRequest('${doc.id}')">Accepter</button>`
                        }
                        <button class="btn-decline" onclick="cancelTrade('${doc.id}')">${data.status === 'active' ? 'Quitter' : 'Refuser'}</button>
                    </div>
                `;
                list.appendChild(div);
            });
        });

    // Sent trades
    db.collection('trades')
        .where('senderId', '==', user.uid)
        .where('status', 'in', ['pending', 'active'])
        .onSnapshot(snap => {
            const list = document.getElementById('sent-trades');
            if (!list) return;
            if (snap.empty) { list.innerHTML = "<p>Aucune demande envoyée.</p>"; return; }
            list.innerHTML = "";
            snap.forEach(doc => {
                const data = doc.data();
                const div = document.createElement('div');
                div.className = "trade-request-item";
                const label = data.status === 'active' ? "EN COURS" : "EN ATTENTE";
                div.innerHTML = `
                    <span>Vers: <b>${data.receiverEmail}</b> (${label})</span>
                    <div class="actions">
                        ${data.status === 'active' ? `<button style="background:#2ecc71;" onclick="renderActiveTrade('${doc.id}')">REJOINDRE</button>` : ''}
                        <button class="btn-decline" onclick="cancelTrade('${doc.id}')">${data.status === 'active' ? 'Annuler Trade' : 'Annuler Demande'}</button>
                    </div>
                `;
                list.appendChild(div);
            });
        });
}

window.startTradeWithEmail = async () => {
    const email = document.getElementById('trade-target-email').value.trim().toLowerCase();
    const currentUser = auth.currentUser;
    if (!email || email === currentUser.email) {
        alert("Veuillez saisir un email valide différent du vôtre.");
        return;
    }

    // Find user by email
    const usersSnap = await db.collection('users').where('email', '==', email).get();
    if (usersSnap.empty) {
        alert("Joueur non trouvé ! Assurez-vous que l'email est correct.");
        return;
    }

    const targetUserDoc = usersSnap.docs[0];
    const targetUserId = targetUserDoc.id;

    // Check if a trade already exists
    const existing = await db.collection('trades')
        .where('senderId', '==', currentUser.uid)
        .where('receiverId', '==', targetUserId)
        .where('status', '==', 'pending')
        .get();

    if (!existing.empty) {
        alert("Une demande est déjà en cours avec ce joueur.");
        return;
    }

    await db.collection('trades').add({
        senderId: currentUser.uid,
        senderEmail: currentUser.email,
        receiverId: targetUserId,
        receiverEmail: email,
        senderOffer: [],
        receiverOffer: [],
        senderReady: false,
        receiverReady: false,
        status: 'pending',
        timestamp: Date.now()
    });

    document.getElementById('trade-target-email').value = "";
    alert("Demande d'échange envoyée !");
};

window.cancelTrade = async (tradeId) => {
    if (confirm("Voulez-vous annuler cet échange ?")) {
        await db.collection('trades').doc(tradeId).delete();
    }
};

window.acceptTradeRequest = async (tradeId) => {
    await db.collection('trades').doc(tradeId).update({ status: 'active' });
    renderActiveTrade(tradeId);
};

async function renderActiveTrade(tradeId) {
    if (activeTradeListener) activeTradeListener();
    
    const content = document.getElementById('content');
    const userId = auth.currentUser.uid;

    activeTradeListener = db.collection('trades').doc(tradeId).onSnapshot(async doc => {
        if (!doc.exists) {
            alert("L'échange a été annulé.");
            renderTradeView();
            return;
        }

        const data = doc.data();
        if (data.status === 'completed') {
            alert("Échange terminé avec succès !");
            await loadCloudState(userId); // Refresh local inventory
            renderTradeView();
            return;
        }

        const isSender = data.senderId === userId;
        const myRole = isSender ? 'sender' : 'receiver';
        const otherRole = isSender ? 'receiver' : 'sender';
        
        const myOffer = data[`${myRole}Offer`];
        const otherOffer = data[`${otherRole}Offer`];
        const myReady = data[`${myRole}Ready`];
        const otherReady = data[`${otherRole}Ready`];

        content.innerHTML = `
            <div id="trade-view">
                <div style="text-align:center; margin-bottom: 20px;">
                    <button onclick="renderTradeView()" style="background: #7f8c8d;">⬅ Quitter l'échange</button>
                </div>
                
                <div class="trade-screen">
                    <div class="trade-box ${myReady ? 'ready' : ''}">
                        <h3>MOI (${auth.currentUser.email})</h3>
                        <div class="trade-slots" id="my-trade-slots"></div>
                        <div class="ready-status ${myReady ? 'status-ready' : 'status-not-ready'}">
                            ${myReady ? 'PRÊT ✓' : 'EN ATTENTE...'}
                        </div>
                    </div>

                    <div class="trade-vs">VS</div>

                    <div class="trade-box ${otherReady ? 'ready' : ''}">
                        <h3>${isSender ? data.receiverEmail : data.senderEmail}</h3>
                        <div class="trade-slots" id="other-trade-slots"></div>
                        <div class="ready-status ${otherReady ? 'status-ready' : 'status-not-ready'}">
                            ${otherReady ? 'PRÊT ✓' : 'EN ATTENTE...'}
                        </div>
                    </div>

                    <div class="trade-footer">
                        <button onclick="toggleTradeReady('${tradeId}', ${myReady})" 
                                style="background: ${myReady ? '#e67e22' : '#27ae60'}; padding: 15px 40px; font-size: 1.2rem;">
                            ${myReady ? 'ANNULER PRÊT' : 'JE SUIS PRÊT !'}
                        </button>
                    </div>

                    <div class="trade-picker">
                        <h3>Ajouter des cartes à l'échange</h3>
                        <div class="inventory-grid-scroll" id="trade-inventory-picker"></div>
                    </div>
                </div>
            </div>
        `;

        // Fill slots
        const mySlots = document.getElementById('my-trade-slots');
        const otherSlots = document.getElementById('other-trade-slots');

        myOffer.forEach(cardId => {
            const card = cards.find(c => c.id === cardId);
            const el = document.createElement('div');
            el.className = "trade-slot-item";
            el.innerHTML = renderOnlyIcon(card);
            if (!myReady) {
                el.style.cursor = "pointer";
                el.onclick = () => removeCardFromTrade(tradeId, cardId, myRole, myOffer);
            }
            mySlots.appendChild(el);
        });

        otherOffer.forEach(cardId => {
            const card = cards.find(c => c.id === cardId);
            const el = document.createElement('div');
            el.className = "trade-slot-item";
            el.innerHTML = renderOnlyIcon(card);
            otherSlots.appendChild(el);
        });

        // Fill picker
        updateTradePicker(tradeId, myOffer, myReady);

        // Check if both ready -> EXECUTE
        if (myReady && otherReady) {
            executeTrade(tradeId, data);
        }
    });
}

function updateTradePicker(tradeId, currentOffer, myReady) {
    const picker = document.getElementById('trade-inventory-picker');
    if (!picker) return;
    
    const counts = getInventoryCounts();
    let uniqueOwned = [...new Set(state.inventory.map(i => i.id))]
        .map(id => cards.find(c => c.id === id));
    
    uniqueOwned.sort((a, b) => getCardRarity(a) - getCardRarity(b) || a.name.localeCompare(b.name));

    picker.innerHTML = uniqueOwned.map(card => {
        const inOffer = currentOffer.filter(id => id === card.id).length;
        const available = counts[card.id] - inOffer;
        if (available <= 0) return '';
        
        return `
            <div class="mini-item-pick rarity-${getCardRarity(card).toString().replace('.', '-')}" 
                 onclick="${myReady ? '' : `addCardToTrade('${tradeId}', '${card.id}')`}"
                 style="${myReady ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                ${renderOnlyIcon(card)}
                <div class="card-quantity">x${available}</div>
            </div>
        `;
    }).join('');
}

window.addCardToTrade = async (tradeId, cardId) => {
    const tradeRef = db.collection('trades').doc(tradeId);
    const doc = await tradeRef.get();
    const data = doc.data();
    const isSender = data.senderId === auth.currentUser.uid;
    const role = isSender ? 'sender' : 'receiver';
    const currentOffer = data[`${role}Offer`];

    if (currentOffer.length >= 6) {
        alert("Maximum 6 cartes par échange !");
        return;
    }

    currentOffer.push(cardId);
    await tradeRef.update({
        [`${role}Offer`]: currentOffer,
        senderReady: false, // Reset ready status on change
        receiverReady: false
    });
};

window.removeCardFromTrade = async (tradeId, cardId, role, currentOffer) => {
    const idx = currentOffer.indexOf(cardId);
    if (idx > -1) {
        currentOffer.splice(idx, 1);
        await db.collection('trades').doc(tradeId).update({
            [`${role}Offer`]: currentOffer,
            senderReady: false,
            receiverReady: false
        });
    }
};

window.toggleTradeReady = async (tradeId, currentReadyStatus) => {
    const isSender = (await db.collection('trades').doc(tradeId).get()).data().senderId === auth.currentUser.uid;
    const role = isSender ? 'sender' : 'receiver';
    await db.collection('trades').doc(tradeId).update({
        [`${role}Ready`]: !currentReadyStatus
    });
};

async function executeTrade(tradeId, tradeData) {
    const tradeRef = db.collection('trades').doc(tradeId);
    
    // Prevent double execution
    const freshDoc = await tradeRef.get();
    if (freshDoc.data().status === 'completed') return;

    console.log("EXECUTION DE L'ECHANGE...");

    try {
        const batch = db.batch();

        // 1. Update Sender Inventory
        const senderRef = db.collection('users').doc(tradeData.senderId);
        const senderSnap = await senderRef.get();
        let senderInv = senderSnap.data().inventory;

        // Remove sender cards, add receiver cards
        tradeData.senderOffer.forEach(id => {
            const idx = senderInv.findIndex(i => i.id === id);
            if (idx !== -1) senderInv.splice(idx, 1);
        });
        tradeData.receiverOffer.forEach(id => {
            senderInv.push({ id: id, obtainedAt: Date.now() });
        });
        batch.update(senderRef, { inventory: senderInv });

        // 2. Update Receiver Inventory
        const receiverRef = db.collection('users').doc(tradeData.receiverId);
        const receiverSnap = await receiverRef.get();
        let receiverInv = receiverSnap.data().inventory;

        // Remove receiver cards, add sender cards
        tradeData.receiverOffer.forEach(id => {
            const idx = receiverInv.findIndex(i => i.id === id);
            if (idx !== -1) receiverInv.splice(idx, 1);
        });
        tradeData.senderOffer.forEach(id => {
            receiverInv.push({ id: id, obtainedAt: Date.now() });
        });
        batch.update(receiverRef, { inventory: receiverInv });

        // 3. Complete Trade
        batch.update(tradeRef, { status: 'completed' });

        await batch.commit();
    } catch (e) {
        console.error("Erreur lors de l'exécution du trade:", e);
        alert("Une erreur est survenue lors du transfert.");
    }
}

// --- CHAT SYSTEM LOGIC ---
let activeChatListener = null;
let unreadMessages = 0;
let isChatActive = false;
let lastMessageTimestamp = 0;

// Écouteur global pour les nouveaux messages (pour les notifications)
function startGlobalChatListener() {
    db.collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(1)
        .onSnapshot(snap => {
            if (snap.empty) return;
            const msg = snap.docs[0].data();
            const ts = msg.timestamp ? msg.timestamp.toMillis() : Date.now();
            
            // Si c'est un nouveau message et qu'on n'est pas sur le chat
            if (ts > lastMessageTimestamp) {
                if (!isChatActive) {
                    unreadMessages++;
                    updateChatBadge();
                }
                lastMessageTimestamp = ts;
            }
        });
}

function updateChatBadge() {
    const btn = document.getElementById('nav-chat');
    if (!btn) return;
    
    let badge = btn.querySelector('.chat-badge');
    if (unreadMessages > 0) {
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'chat-badge';
            btn.appendChild(badge);
        }
        badge.textContent = `+${unreadMessages}`;
    } else if (badge) {
        badge.remove();
    }
}

async function renderChatView() {
    if (state.isOpening) return;
    isChatActive = true;
    unreadMessages = 0;
    updateChatBadge();

    if (activeChatListener) { activeChatListener(); activeChatListener = null; }
    if (activeTradeListener) { activeTradeListener(); activeTradeListener = null; }

    document.getElementById('sort-controls').style.display = 'none';
    const content = document.getElementById('content');
    const user = auth.currentUser;
    if (!user) return;

    content.innerHTML = `
        <div id="chat-view">
            <h2 style="text-align:center; color: var(--emerald-color);">Chat Global</h2>
            <div class="chat-container">
                <div class="chat-messages" id="chat-messages">
                    <p style="text-align:center; color: #555;">Chargement des messages...</p>
                </div>
                <div class="chat-input-area">
                    <input type="text" id="chat-input" class="chat-input" placeholder="Écrivez un message..." maxlength="200">
                    <button id="chat-send-btn" class="chat-send-btn" onclick="sendMessage()">Envoyer</button>
                </div>
            </div>
        </div>
    `;

    // Ecouter les messages en temps réel (limité aux 50 derniers)
    activeChatListener = db.collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(50)
        .onSnapshot(snap => {
            const list = document.getElementById('chat-messages');
            if (!list) return;
            list.innerHTML = "";
            
            const messages = [];
            snap.forEach(doc => messages.push(doc.data()));
            
            // On les remet dans l'ordre chronologique
            messages.reverse().forEach(msg => {
                const isAdmin = msg.senderEmail === 'hellosuperordi@gmail.com';
                const div = document.createElement('div');
                div.className = `chat-message ${isAdmin ? 'admin-msg' : ''}`;
                div.innerHTML = `
                    <span class="sender">${isAdmin ? '[ADMIN] ' : ''}${msg.senderEmail}</span>
                    <span class="text">${msg.text}</span>
                `;
                list.appendChild(div);
            });
            
            // Scroll auto en bas
            list.scrollTop = list.scrollHeight;
        });

    // Permettre d'envoyer avec la touche Entrée
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    const user = auth.currentUser;

    if (!text || !user) return;

    input.value = "";
    try {
        await db.collection('messages').add({
            senderId: user.uid,
            senderEmail: user.email,
            text: text,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) {
        console.error("Erreur d'envoi du message:", e);
        alert("Erreur lors de l'envoi du message.");
    }
}

function renderMarketView() {
    if (state.isOpening) return;
    document.getElementById('sort-controls').style.display = 'none';
    const content = document.getElementById('content');
    content.innerHTML = `
        <div id="market-view" style="display: flex; justify-content: center; align-items: center; min-height: 50vh;">
            <h2 style="color: var(--gold-vibrant); text-transform: uppercase; letter-spacing: 2px;">Boutique bientôt disponible...</h2>
        </div>
    `;
}

function setupNavigation() {
    const navs = [
        { id: 'nav-inventory', func: renderInventory },
        { id: 'nav-index', func: renderIndex },
        { id: 'nav-craft', func: renderCraftView },
        { id: 'nav-booster', func: renderBoosterView },
        { id: 'nav-trade', func: renderTradeView },
        { id: 'nav-chat', func: renderChatView },
        { id: 'nav-market', func: renderMarketView }
    ];
    navs.forEach(nav => {
        const btn = document.getElementById(nav.id);
        if (btn) {
            btn.onclick = (e) => {
                if (state.isOpening) return;
                
                // Nettoyage des listeners quand on change d'onglet
                isChatActive = (nav.id === 'nav-chat');
                if (activeChatListener) { activeChatListener(); activeChatListener = null; }
                if (activeTradeListener) { activeTradeListener(); activeTradeListener = null; }

                document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                nav.func();
            };
        }
    });
    document.getElementById('sort-select').onchange = renderInventory;
}

function init() {
    setupNavigation();
    renderInventory();
    updateUI();
    startGlobalChatListener();
}

init();
