// Game State
let state = {
    emeralds: 1000,
    inventory: [], 
    isOpening: false,
    prestige: 0
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

        // START NOTIFICATION LISTENERS
        startGlobalTradeListener(user);

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

        // VERIFICATION BETA TESTER
        const betaEmails = ['stefanodiberar06@gmail.com', 'clementcecchettigibert@gmail.com'];
        if (betaEmails.includes(user.email)) {
            const nav = document.querySelector('nav');
            if (!document.getElementById('nav-beta')) {
                const betaBtn = document.createElement('button');
                betaBtn.id = 'nav-beta';
                betaBtn.textContent = 'BÊTA';
                betaBtn.style.background = '#3498db';
                betaBtn.onclick = renderBetaView;
                nav.appendChild(betaBtn);
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

// --- ADMIN SIMULATION SYSTEM ---
let simulatedUser = null;

window.adminSimulateUser = async (uid, email) => {
    if (!confirm(`Voulez-vous simuler le compte de ${email} ?\nToutes vos actions (ouverture, craft, etc.) affecteront son inventaire.`)) return;
    
    simulatedUser = { uid, email };
    await loadCloudState(uid);
    
    // Mise à jour de l'affichage
    const display = document.getElementById('user-display-email');
    display.innerHTML = `<span style="color: #e67e22; font-weight: bold;">[SIMULATION] ${email}</span> 
                        <button onclick="stopSimulation()" style="padding: 2px 8px; background: #c0392b; font-size: 0.6rem; margin-left: 10px; border-width: 2px;">QUITTER</button>`;
    
    renderInventory();
    alert(`Vous contrôlez maintenant le compte de ${email}`);
};

window.stopSimulation = async () => {
    const user = auth.currentUser;
    simulatedUser = null;
    
    document.getElementById('user-display-email').textContent = user.email;
    await loadCloudState(user.uid);
    renderInventory();
    alert("Retour sur votre compte administrateur.");
};

function saveState() {
    localStorage.setItem('minecraftCardCollectionState_v5', JSON.stringify(state));
    const uid = simulatedUser ? simulatedUser.uid : (auth.currentUser ? auth.currentUser.uid : null);
    if (uid) saveCloudState(uid);
    updateUI();
}

function getCardRarity(card) {
    if (card.rarity_override !== undefined) return card.rarity_override;
    return raritySettings[card.type] || 1;
}

function getArmorPieceWeight(name) {
    const pieceOrder = ['Helmet', 'Chestplate', 'Leggings', 'Boots', 'Horse Armor', 'Wolf Armor'];
    for (let i = 0; i < pieceOrder.length; i++) {
        if (name.includes(pieceOrder[i])) return i;
    }
    return 99;
}

function updateUI() {
    const emEl = document.getElementById('emeralds-count');
    const boEl = document.getElementById('boosters-count');
    if (emEl) emEl.textContent = state.emeralds;
    if (boEl) boEl.textContent = `Boosters: ∞`;

    // Visibilité Menu Maître : accessible si on possède la Master OU si on a déjà passé un prestige
    const navMaster = document.getElementById('nav-master');
    if (navMaster) {
        const counts = getInventoryCounts();
        const hasMaster = !!counts['999'];
        navMaster.style.display = (hasMaster || (state.prestige || 0) > 0) ? 'inline-block' : 'none';
    }
    
    if (state.prestige > 0) {
        document.body.classList.add('prestige-mode');
    } else {
        document.body.classList.remove('prestige-mode');
    }
}

function getInventoryCounts() {
    const counts = {};
    state.inventory.forEach(item => {
        counts[item.id] = (counts[item.id] || 0) + 1;
    });

    // --- LOGIQUE CARTE ULTIMATE (ID 999) ---
    // Pour obtenir la Master Card, il faut TOUTES les cartes actuellement débloquées
    // Si prestige 0 : toutes les cartes de base (id !== 999 et category !== Ascension)
    // Si prestige 1 : base + Ascension
    const requiredCards = cards.filter(c => {
        if (c.id === '999') return false;
        if (c.category === 'Ascension' && (state.prestige || 0) === 0) return false;
        return true;
    });
    
    const requiredIds = requiredCards.map(c => c.id);
    const ownedIds = Object.keys(counts);
    const hasAll = requiredIds.every(id => ownedIds.includes(id));

    if (hasAll) {
        counts['999'] = 1;
    } else {
        delete counts['999'];
    }

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
    
    // On utilise les clés de counts pour inclure la carte 999 si elle y est
    const uniqueIds = Object.keys(counts);
    
    uniqueIds.forEach(id => {
        let cardData = cards.find(c => c.id === id);
        
        // Si c'est la carte Ultimate et qu'elle n'est pas dans cards.json, on la définit ici
        if (id === '999' && !cardData) {
            cardData = {
                id: '999',
                name: "THE MASTER COLLECTION",
                type: 'ultimate',
                category: 'Secret',
                description: "La preuve ultime de votre détermination."
            };
        }

        if (cardData) {
            const items = state.inventory.filter(i => i.id === id);
            const lastObtained = items.length > 0 ? Math.max(...items.map(i => i.obtainedAt)) : Date.now();
            const rarity = getCardRarity(cardData);
            displayList.push({ ...cardData, count: counts[id], lastObtained, actual_rarity: rarity });
        }
    });

    const sortType = document.getElementById('sort-select').value;
    if (sortType === 'rarity') {
        displayList.sort((a, b) => {
            if (b.actual_rarity !== a.actual_rarity) return b.actual_rarity - a.actual_rarity;
            if (a.category !== b.category) {
                const order = ['Ascension', 'Blocks', 'Outils', 'Armures', 'Items', 'Musique', 'Secret'];
                return order.indexOf(a.category) - order.indexOf(b.category);
            }
            if (a.category === 'Armures') {
                const matA = a.name.split(' ')[0];
                const matB = b.name.split(' ')[0];
                if (matA !== matB) return matA.localeCompare(matB);
                return getArmorPieceWeight(a.name) - getArmorPieceWeight(b.name);
            }
            return a.name.localeCompare(b.name);
        });
    } else if (sortType === 'category') {
        displayList.sort((a, b) => {
            const order = ['Blocks', 'Outils', 'Armures', 'Items', 'Musique', 'Secret'];
            if (a.category !== b.category) return order.indexOf(a.category) - order.indexOf(b.category);
            if (b.actual_rarity !== a.actual_rarity) return b.actual_rarity - a.actual_rarity;
            if (a.category === 'Armures') {
                const matA = a.name.split(' ')[0];
                const matB = b.name.split(' ')[0];
                if (matA !== matB) return matA.localeCompare(matB);
                return getArmorPieceWeight(a.name) - getArmorPieceWeight(b.name);
            }
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
        grid.appendChild(createCardElement(card, true, card.count, !!simulatedUser));
    });
}

window.adminRemoveCard = (cardId, cardName) => {
    if (!simulatedUser) return;
    if (!confirm(`Supprimer une instance de "${cardName}" de l'inventaire de ${simulatedUser.email} ?`)) return;

    const idx = state.inventory.findIndex(i => i.id === cardId);
    if (idx !== -1) {
        state.inventory.splice(idx, 1);
        saveState();
        renderInventory();
    }
};

function renderIndex() {
    if (state.isOpening) return;
    document.getElementById('sort-controls').style.display = 'none';
    const content = document.getElementById('content');
    content.innerHTML = '';

    const counts = getInventoryCounts();
    const ownedUnique = Object.keys(counts).filter(id => id !== '999').length;
    const totalUnique = cards.filter(c => c.id !== '999').length;
    
    // Si la Master Card est possédée, on affiche ownedUnique + 1 (ex: 241 / 240)
    const hasMaster = !!counts['999'];
    const displayOwned = hasMaster ? ownedUnique + 1 : ownedUnique;

    const statsContainer = document.createElement('div');
    statsContainer.className = 'collection-stats';
    statsContainer.innerHTML = `Complétion : <span>${displayOwned} / ${totalUnique}</span> cards`;
    content.appendChild(statsContainer);

    const categories = ['Blocks', 'Outils', 'Armures', 'Items', 'Musique', 'Secret', 'Ascension'];

    categories.forEach(cat => {
        // Ne pas afficher Ascension si on est prestige 0 et qu'on n'a aucune carte Ascension
        if (cat === 'Ascension' && (state.prestige || 0) === 0) {
            const hasAscension = cards.some(c => c.category === 'Ascension' && (counts[c.id] || 0) > 0);
            if (!hasAscension) return;
        }

        const catTitle = document.createElement('h2');
        catTitle.className = 'section-title';
        catTitle.textContent = cat;
        content.appendChild(catTitle);

        const grid = document.createElement('div');
        grid.className = 'card-grid';
        content.appendChild(grid);

        const catCards = cards.filter(c => c.category === cat && c.id !== '999');
        let sortedCards;

        if (cat === 'Armures') {
            sortedCards = [...catCards].sort((a, b) => {
                const rarityA = getCardRarity(a);
                const rarityB = getCardRarity(b);
                if (rarityA !== rarityB) return rarityB - rarityA;

                const matA = a.name.split(' ')[0];
                const matB = b.name.split(' ')[0];
                if (matA !== matB) return matA.localeCompare(matB);

                return getArmorPieceWeight(a.name) - getArmorPieceWeight(b.name);
            });
        } else {
            sortedCards = [...catCards].sort((a, b) => getCardRarity(b) - getCardRarity(a) || a.name.localeCompare(b.name));
        }

        sortedCards.forEach(card => {
            const count = counts[card.id] || 0;
            const isOwned = count > 0;
            const cardEl = createCardElement(card, isOwned, count);
            if (!isOwned) cardEl.classList.add('locked');
            grid.appendChild(cardEl);
        });
    });
}

function createCardElement(card, isOwned, count = 0, isSimulation = false) {
    let rarity = getCardRarity(card);
    
    // Si c'est l'Ultimate déguisée, on force l'apparence Secrète (Rareté 7)
    const isDisguised = (card.id === '999' && (state.ultimateDisguise || card.isDisguisedInChat));
    if (isDisguised) rarity = 7;

    const cardEl = document.createElement('div');
    const rarityClass = `rarity-${rarity.toString().replace('.', '-')}`;
    cardEl.className = `card ${rarityClass}`;
    
    if (isOwned) {
        if (card.type === 'gold') cardEl.classList.add('effect-gold');
        if (card.type === 'green_gold') cardEl.classList.add('effect-green-gold');
        if (card.type === 'red_gold') cardEl.classList.add('effect-red-gold');
        if (card.type === 'blue_dark_gold') cardEl.classList.add('effect-blue-dark-gold');
        if (card.type === 'immersive') cardEl.classList.add('effect-immersive');
        if (card.type === 'immersive_orange_dark') cardEl.classList.add('effect-immersive-orange');
        
        // Gestion des effets Ultimate vs Secret
        if (card.id === '999' && !isDisguised) {
            cardEl.classList.add('effect-ultimate');
        } else if (card.type === 'secret' || isDisguised) {
            if (card.id === '199') {
                cardEl.classList.add('card-secret-gold');
            } else if (card.id === '244') {
                cardEl.classList.add('card-armor-soul');
            } else if (card.id === '245') {
                cardEl.classList.add('card-pigeon');
            } else {
                cardEl.classList.add('effect-secret'); 
            }
        }
    }

    let innerHTML = `<div class="card-name">${card.name}</div>`;
    
    // Ajout bouton de suppression admin en mode simulation
    if (isSimulation && isOwned && card.id !== '999') {
        innerHTML += `<button class="card-admin-delete" onclick="event.stopPropagation(); adminRemoveCard('${card.id}', '${card.name.replace(/'/g, "\\'")}')">🗑️</button>`;
    }

    if (card.id === '999') {
        cardEl.onmouseenter = startUltimateEffect;
        cardEl.onmouseleave = stopUltimateEffect;
        cardEl.onclick = (e) => e.stopPropagation();

        const disguiseId = card.isDisguisedInChat ? card.disguiseId : state.ultimateDisguise;
        const disguiseData = disguiseId ? cards.find(c => c.id === disguiseId) : null;
        
        let visualHTML = `
            <div class="ultimate-visual-container">
                <div class="ultimate-cube">
                    <div class="cube-face front"></div>
                    <div class="cube-face back"></div>
                    <div class="cube-face right"></div>
                    <div class="cube-face left"></div>
                    <div class="cube-face top"></div>
                    <div class="cube-face bottom"></div>
                </div>
            </div>
        `;

        if (disguiseData) {
            if (disguiseData.is_item) {
                visualHTML = `
                    <div class="card-image-container item-view">
                        <img src="cards_images/${disguiseData.item_asset}" class="mc-item" alt="${disguiseData.name}">
                    </div>
                `;
            } else {
                visualHTML = `
                    <div class="card-image-container">
                        <div class="mc-block">
                            <div class="mc-face top" style="background-image: url('cards_images/${disguiseData.top}')"></div>
                            <div class="mc-face right" style="background-image: url('cards_images/${disguiseData.side}')"></div>
                            <div class="mc-face left" style="background-image: url('cards_images/${disguiseData.side}')"></div>
                        </div>
                    </div>
                `;
            }
        }

        innerHTML = `
            ${!disguiseData ? '<div class="card-ultimate-vortex"></div>' : ''}
            <div class="card-name" style="font-size: ${disguiseData ? '0.75rem' : '1rem'}">${disguiseData ? disguiseData.name.toUpperCase() : card.name}</div>
            ${!disguiseData ? '<div style="font-size: 0.5rem; color: #fff; text-align: center; margin-top: -10px; z-index: 10; position: relative; opacity: 0.7;">(CLIQUEZ)</div>' : ''}
            ${visualHTML}
        `;
    } else if (card.is_item) {
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
    
    if (card.type === 'secret' && card.id !== '199' && card.id !== '244' && card.id !== '245') { // Ne pas activer l'effet glitch pour le lingot d'or, l'âme de l'armurier et le pigeon
        cardEl.addEventListener('mouseenter', startSecretHack);
        cardEl.addEventListener('mouseleave', stopSecretHack);
    }

    if (card.id === '245') {
        cardEl.addEventListener('mouseenter', startSiteShake);
        cardEl.addEventListener('mouseleave', stopSiteShake);
    }

    return cardEl;
}

function startSiteShake() {
    document.body.classList.add('site-shake');
    const app = document.getElementById('game-app');
    if (app) app.classList.add('site-shake');
}

function stopSiteShake() {
    document.body.classList.remove('site-shake');
    const app = document.getElementById('game-app');
    if (app) app.classList.remove('site-shake');
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
    
    // Vérifie si un God Pack est forcé pour ce booster
    const isGodPack = state.forceNextGodPack === true || Math.random() < 0.0005; // Force ou 1 chance sur 2000
    
    // Si c'était forcé, on le reset immédiatement
    if (state.forceNextGodPack) {
        state.forceNextGodPack = false;
        // La sauvegarde se fera à la fin de la fonction (saveState())
    }

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
                const isPrestige = (state.prestige || 0) >= 1;
                const upgradeChance = isPrestige && Math.random() < 0.5;

                if (r < 0.1) {
                    // Red Gold (6) -> Blue Dark Gold (6.5)
                    cardId = upgradeChance ? getRandomByActualRarity(6.5, true) : getRandomByActualRarity(6, true);
                } else if (r < 0.6) {
                    // Gold (5) -> Green Gold (5.5)
                    cardId = upgradeChance ? getRandomByActualRarity(5.5, true) : getRandomByActualRarity(5, true);
                } else if (r < 3.1) {
                    // Immersive (4.5) -> Immersive Orange Dark (4.7)
                    cardId = upgradeChance ? getRandomByActualRarity(4.7, true) : getRandomByActualRarity(4.5, true);
                } else if (r < 8.1) {
                    // Epic (4) -> Epic Blue Dark (4.2)
                    cardId = upgradeChance ? getRandomByActualRarity(4.2, true) : getRandomByActualRarity(4, true);
                } else if (r < 18.1) {
                    // Rare (3) -> Rare Purple (3.2)
                    cardId = upgradeChance ? getRandomByActualRarity(3.2, true) : getRandomByActualRarity(3, true);
                } else {
                    cardId = getRandomByActualRarity(2);
                }
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
                if (rarity === 6.5) {
                    cardEl.classList.add('red-gold-reveal'); // On réutilise l'anim mais on change le flash
                    triggerFlash('flash-blue');
                    document.body.classList.add('shake-screen');
                    setTimeout(() => document.body.classList.remove('shake-screen'), 500);
                } else if (rarity === 6) {
                    cardEl.classList.add('red-gold-reveal');
                    triggerFlash('flash-red');
                    document.body.classList.add('shake-screen');
                    setTimeout(() => document.body.classList.remove('shake-screen'), 500);
                } else if (rarity === 5.5) {
                    cardEl.classList.add('gold-reveal');
                    triggerFlash('flash-green');
                } else if (rarity === 5) {
                    cardEl.classList.add('gold-reveal');
                    triggerFlash('flash-gold');
                } else if (rarity === 4.7) {
                    cardEl.classList.add('epic-shake');
                    triggerFlash('flash-orange');
                } else if (rarity === 4.5) {
                    cardEl.classList.add('epic-shake');
                    triggerFlash('flash-white');
                } else if (rarity === 4.2) {
                    cardEl.classList.add('reveal-anim');
                    triggerFlash('flash-blue');
                } else if (rarity === 3.2) {
                    cardEl.classList.add('reveal-anim');
                    triggerFlash('flash-purple');
                } else if (rarity >= 3) {
                    cardEl.classList.add('reveal-anim');
                    triggerFlash('flash-white');
                } else {
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

function getRandomByActualRarity(level, exact = false) {
    const isPrestige = (state.prestige || 0) >= 1;
    let possible;
    
    if (exact) {
        possible = cards.filter(c => getCardRarity(c) === level && c.obtainable !== false);
    } else {
        possible = cards.filter(c => Math.floor(getCardRarity(c)) === Math.floor(level) && c.obtainable !== false);
    }

    // Sécurité Prestige : Empêcher les cartes d'Ascension d'apparaître si on est Prestige 0
    if (!isPrestige) {
        possible = possible.filter(c => c.category !== 'Ascension');
    }

    // Fallback si l'exactitude n'a rien donné (pour éviter un crash)
    if (possible.length === 0 && exact) {
        possible = cards.filter(c => Math.floor(getCardRarity(c)) === Math.floor(level) && c.obtainable !== false);
        if (!isPrestige) {
            possible = possible.filter(c => c.category !== 'Ascension');
        }
    }

    if (possible.length === 0) {
        possible = cards.filter(c => c.obtainable !== false);
        if (!isPrestige) {
            possible = possible.filter(c => c.category !== 'Ascension');
        }
    }
    
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
    
    // Ajout des classes d'effets pour que les icônes dans le craft soient cohérentes
    let effectClass = '';
    if (card.type === 'gold') effectClass = 'effect-gold';
    else if (card.type === 'green_gold') effectClass = 'effect-green-gold';
    else if (card.type === 'red_gold') effectClass = 'effect-red-gold';
    else if (card.type === 'blue_dark_gold') effectClass = 'effect-blue-dark-gold';
    else if (card.type === 'immersive') effectClass = 'effect-immersive';
    else if (card.type === 'immersive_orange_dark') effectClass = 'effect-immersive-orange';
    else if (card.type === 'secret') effectClass = 'effect-secret';
    else if (card.type === 'ultimate') effectClass = 'effect-ultimate';

    return `<div class="mc-slot-item ${rarityClass} ${effectClass}">
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
    
    // On calcule les vrais comptes de l'inventaire (sans la Master Card virtuelle)
    const counts = {};
    state.inventory.forEach(item => {
        counts[item.id] = (counts[item.id] || 0) + 1;
    });
    
    // Get unique owned cards that are not Secret or Ultimate
    let uniqueOwned = [...new Set(state.inventory.map(i => i.id))]
        .map(id => cards.find(c => c.id === id))
        .filter(c => c && c.type !== 'secret' && c.type !== 'ultimate' && c.id !== '999');
    
    // Sort by rarity
    uniqueOwned.sort((a, b) => getCardRarity(a) - getCardRarity(b) || a.name.localeCompare(b.name));

    picker.innerHTML = uniqueOwned.map(card => {
        const inGrid = craftingSlots.filter(s => s && s.id === card.id).length;
        const available = (counts[card.id] || 0) - inGrid;
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
        if (allSameRarity && (firstRarity < 7)) {
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
    let nextRarity = nextRarityMap[baseRarity] || baseRarity;
    
    // RÈGLES SPÉCIALES ASCENSION
    // 9 Immersive Orange Dark (4.7) -> 1 Green Gold (5.5)
    if (baseRarity === 4.7) nextRarity = 5.5;
    // 9 Green Gold (5.5) -> 1 Blue Dark Gold (6.5)
    if (baseRarity === 5.5) nextRarity = 6.5;
    // 9 Blue Dark Gold (6.5) -> 1 Secrète (7)
    if (baseRarity === 6.5) nextRarity = 7;

    const possibleReward = cards.filter(c => {
        const r = getCardRarity(c);
        // On autorise les cartes non obtenables (Secret) pendant le craft pour éviter les crashs
        return r === nextRarity && (c.obtainable !== false || r === 7);
    });
    
    if (possibleReward.length === 0) {
        console.error("Aucune récompense possible pour la rareté:", nextRarity);
        state.isOpening = false;
        gui.classList.remove('is-crafting');
        btn.disabled = false;
        return;
    }

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

async function renderBetaView() {
    document.getElementById('sort-controls').style.display = 'none';
    const content = document.getElementById('content');
    
    // Calcul de quelques stats globales pour les testeurs
    const usersSnap = await db.collection('users').get();
    let totalCardsOwned = 0;
    usersSnap.forEach(doc => {
        totalCardsOwned += (doc.data().inventory || []).length;
    });

    content.innerHTML = `
        <div id="beta-view" style="padding: 20px; background: #1a1a1a; border: 4px solid #3498db; border-radius: 8px;">
            <h2 style="color: #3498db; text-align: center;">PANNEAU BÊTA-TESTEUR</h2>
            <p style="text-align: center; color: #aaa;">Merci de nous aider à améliorer le jeu !</p>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 30px;">
                <div style="background: #222; padding: 20px; border: 2px solid #444;">
                    <h3 style="color: #2ecc71;">Statistiques Globales</h3>
                    <p>Joueurs inscrits : <strong>${usersSnap.size}</strong></p>
                    <p>Total des cartes en circulation : <strong>${totalCardsOwned}</strong></p>
                </div>
                
                <div style="background: #222; padding: 20px; border: 2px solid #444;">
                    <h3 style="color: #e67e22;">Notes de Version</h3>
                    <ul style="font-size: 0.9rem; color: #ccc; padding-left: 20px;">
                        <li>Ajout de la catégorie "Armures" complète</li>
                        <li>Nouveaux minerais : Paladium et Endium</li>
                        <li>Correction du tri dans l'index</li>
                        <li>Optimisation du système de Craft</li>
                    </ul>
                </div>
            </div>

            <div style="background: #222; padding: 20px; border: 2px solid #444; margin-top: 20px;">
                <h3 style="color: #3498db;">Rapport de Bug / Suggestions</h3>
                <p style="font-size: 0.9rem; color: #aaa;">Pour toute suggestion ou bug trouvé, merci de contacter l'administrateur sur Discord ou par Email.</p>
                <div style="text-align: center; margin-top: 15px;">
                    <button style="background: #34495e;" onclick="alert('Fonctionnalité de rapport direct bientôt disponible !')">Envoyer un Feedback</button>
                </div>
            </div>

            <div style="margin-top: 30px; text-align: center; font-style: italic; color: #555;">
                Accès exclusif : ${auth.currentUser.email}
            </div>
        </div>
    `;
}

async function renderAdminView() {
    if (auth.currentUser?.email !== 'hellosuperordi@gmail.com') return;
    
    document.getElementById('sort-controls').style.display = 'none';
    const content = document.getElementById('content');
    content.innerHTML = `
        <div id="admin-view" style="padding: 20px; background: #111; border: 4px solid #c0392b;">
            <h2 style="color: #c0392b;">PANNEAU D'ADMINISTRATION</h2>
            <div style="background: #222; padding: 20px; margin-bottom: 20px;">
                <h3>Mes Actions (Admin)</h3>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button onclick="adminGiveAllCards()">Se donner TOUTES les cartes</button>
                    <button onclick="adminGivePrestigeCards()" style="background: #8e44ad;">Se donner les cartes Prestige I</button>
                    <button onclick="adminResetSelf()" style="background: #e67e22;">Réinitialiser MA collection</button>
                    <button onclick="adminResetPrestige()" style="background: #f39c12; color: #000;">Réinitialiser MON Prestige</button>
                    <button onclick="adminClearChat()" style="background: #c0392b;">Vider le CHAT GLOBAL</button>
                </div>
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
                    <button onclick="adminForceGodPack('${userId}', '${userEmail}')" style="background: #f1c40f; color: #000; padding: 5px 10px; font-weight: bold;">FORCE GOD PACK</button>
                    <button onclick="adminSimulateUser('${userId}', '${userEmail}')" style="background: #e67e22; padding: 5px 10px;">SIMULER</button>
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

window.adminForceGodPack = async (uid, email) => {
    if (confirm(`Forcer le prochain booster de ${email} à être un GOD PACK ?`)) {
        await db.collection('users').doc(uid).update({ forceNextGodPack: true });
        alert("Action confirmée ! Le prochain booster sera un God Pack.");
    }
};

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
    // On ne donne que les cartes de base (pas la Master ni les Ascension)
    cards.filter(c => c.id !== '999' && c.category !== 'Ascension')
         .forEach(c => state.inventory.push({ id: c.id, obtainedAt: now }));
    saveState();
    alert("Toutes les cartes de base ont été ajoutées !");
    renderInventory();
};

window.adminResetSelf = () => {
    if (confirm("Reset TA collection ?")) {
        state.inventory = []; state.emeralds = 1000;
        saveState();
        renderInventory();
    }
};

window.adminResetPrestige = () => {
    if (confirm("Réinitialiser TON niveau de Prestige à 0 ?")) {
        state.prestige = 0;
        saveState();
        updateUI();
        renderInventory();
        alert("Prestige réinitialisé !");
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
let unreadTrades = 0;
let isTradeActive = false;
let globalTradeListenerInstance = null;

function startGlobalTradeListener(user) {
    if (globalTradeListenerInstance) globalTradeListenerInstance();
    
    globalTradeListenerInstance = db.collection('trades')
        .where('receiverId', '==', user.uid)
        .where('status', '==', 'pending')
        .onSnapshot(snap => {
            if (!isTradeActive) {
                unreadTrades = snap.size;
                updateTradeBadge();
            }
        });
}

function updateTradeBadge() {
    const btn = document.getElementById('nav-trade');
    if (!btn) return;
    
    let badge = btn.querySelector('.trade-badge');
    if (unreadTrades > 0) {
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'chat-badge trade-badge';
            btn.appendChild(badge);
        }
        badge.textContent = `+${unreadTrades}`;
    } else if (badge) {
        badge.remove();
    }
}

async function renderTradeView() {
    if (state.isOpening) return;
    isTradeActive = true;
    unreadTrades = 0;
    updateTradeBadge();
    
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
        .map(id => cards.find(c => c.id === id))
        .filter(c => c && c.id !== '999'); // Exclure l'Ultimate du trade
    
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
    const isCurrentUserAdmin = user.email === 'hellosuperordi@gmail.com';

    content.innerHTML = `
        <div id="chat-view">
            <h2 style="text-align:center; color: var(--emerald-color);">Chat Global</h2>
            <div class="chat-container">
                <div class="chat-messages" id="chat-messages">
                    <p style="text-align:center; color: #555;">Chargement des messages...</p>
                </div>
                <div id="chat-card-picker" class="chat-card-picker"></div>
                <div class="chat-input-area">
                    <button id="chat-card-btn" style="background: #34495e; padding: 5px 10px !important; font-size: 1.2rem !important;" onclick="toggleChatCardPicker()">🎴</button>
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
            snap.forEach(doc => messages.push({ id: doc.id, ...doc.data() }));
            
            // On les remet dans l'ordre chronologique
            messages.reverse().forEach(msg => {
                const isAdmin = msg.senderEmail === 'hellosuperordi@gmail.com';
                const isBeta = ['stefanodiberar06@gmail.com', 'clementcecchettigibert@gmail.com'].includes(msg.senderEmail);
                
                const div = document.createElement('div');
                div.className = `chat-message ${isAdmin ? 'admin-msg' : ''} ${isBeta ? 'beta-msg' : ''}`;
                div.style.position = 'relative';
                
                let prefix = '';
                if (isAdmin) prefix = '[ADMIN] ';
                else if (isBeta) prefix = '[BETA TESTER] ';

                let prestigeSuffix = '';
                if (msg.prestige && msg.prestige > 0) {
                    const roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
                    const prestigeStr = roman[msg.prestige] || msg.prestige;
                    prestigeSuffix = ` <span class="chat-prestige" style="color:#8e44ad; font-weight:bold; text-shadow:0 0 5px rgba(142,68,173,0.5);">PRESTIGE ${prestigeStr}</span>`;
                }

                const date = msg.timestamp ? msg.timestamp.toDate() : new Date();
                const now = new Date();
                const isToday = date.toDateString() === now.toDateString();
                const yesterday = new Date();
                yesterday.setDate(now.getDate() - 1);
                const isYesterday = date.toDateString() === yesterday.toDateString();

                let datePrefix = "";
                if (isToday) datePrefix = "Aujourd'hui ";
                else if (isYesterday) datePrefix = "Hier ";
                else datePrefix = date.toLocaleDateString('fr-FR') + " ";

                const timeStr = datePrefix + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                let contentHTML = `
                    <span class="sender">${prefix}${msg.senderEmail}${prestigeSuffix} <span class="chat-time">${timeStr}</span></span>
                    <span class="text">${msg.text || ''}</span>
                    ${isCurrentUserAdmin ? `<button onclick="deleteChatMessage('${msg.id}')" style="position: absolute; right: 5px; top: 5px; padding: 2px 6px; background: #c0392b; font-size: 0.6rem; border-width: 1px;">X</button>` : ''}
                `;

                // Si le message contient une carte, on l'affiche
                if (msg.cardId) {
                    let cardData;
                    if (msg.cardId === '999') {
                        // Cas spécial Master Card : on utilise le skin stocké dans le MESSAGE
                        const disguiseData = msg.disguiseId ? cards.find(c => c.id === msg.disguiseId) : null;
                        
                        cardData = {
                            id: '999',
                            name: disguiseData ? disguiseData.name : "THE MASTER COLLECTION",
                            // Si déguisée, on force le type 'secret' pour l'apparence, sinon 'ultimate'
                            type: disguiseData ? 'secret' : 'ultimate',
                            isDisguisedInChat: !!disguiseData,
                            disguiseId: msg.disguiseId, // On utilise l'ID du message
                            is_item: disguiseData ? disguiseData.is_item : false,
                            item_asset: disguiseData ? disguiseData.item_asset : null,
                            top: disguiseData ? disguiseData.top : null,
                            side: disguiseData ? disguiseData.side : null
                        };
                    } else {
                        cardData = cards.find(c => c.id === msg.cardId);
                    }

                    if (cardData) {
                        const cardWrapper = document.createElement('div');
                        cardWrapper.className = 'chat-card-flex';
                        cardWrapper.appendChild(createCardElement(cardData, true, 0));
                        contentHTML += cardWrapper.outerHTML;
                    }
                }

                div.innerHTML = contentHTML;
                list.appendChild(div);
            });
            
            // Scroll auto en bas
            list.scrollTop = list.scrollHeight;
        });

    // Remplir le sélecteur de cartes
    updateChatCardPicker();

    // Permettre d'envoyer avec la touche Entrée
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

window.passPrestige = () => {
    if (!confirm("⚠️ ATTENTION : Passer un prestige va SACRIFIER votre Master Card pour débloquer de nouvelles cartes.\nÊtes-vous sûr ?")) return;
    
    // Effet d'explosion de la Master Card
    triggerMasterExplosion(() => {
        state.prestige = (state.prestige || 0) + 1;
        state.ultimateDisguise = null;
        
        saveState();
        
        // Fermer les modales et forcer le rafraichissement
        const modals = document.querySelectorAll('div[style*="z-index: 2000000"]');
        modals.forEach(m => m.remove());
        
        alert(`Le pouvoir de la Master Card s'est libéré ! Vous êtes Prestige ${state.prestige}. De nouvelles cartes "Ascension" sont désormais disponibles dans les boosters. Collectez-les toutes pour reformer la Master Collection !`);
        renderInventory();
        updateUI();
    });
};

function triggerMasterExplosion(callback) {
    const overlay = document.createElement('div');
    overlay.style = "position:fixed; inset:0; z-index:3000000; background:white; opacity:0; pointer-events:none; transition: opacity 0.5s;";
    document.body.appendChild(overlay);

    // Flash blanc initial
    requestAnimationFrame(() => {
        overlay.style.opacity = "1";
    });

    // Créer des particules d'explosion
    const container = document.getElementById('fullscreen-fireworks');
    if (container) {
        container.innerHTML = '';
        for (let i = 0; i < 200; i++) {
            const p = document.createElement('div');
            p.className = 'cosmic-particle';
            p.style.left = '50%';
            p.style.top = '50%';
            p.style.background = Math.random() > 0.5 ? '#fff' : (Math.random() > 0.5 ? '#8e44ad' : '#2980b9');
            p.style.width = (Math.random() * 10 + 5) + 'px';
            p.style.height = p.style.width;
            
            const angle = Math.random() * Math.PI * 2;
            const dist = 100 + Math.random() * 200;
            p.style.setProperty('--tx', (Math.cos(angle) * dist) + 'vw');
            p.style.setProperty('--ty', (Math.sin(angle) * dist) + 'vh');
            p.style.animation = `particle-fly ${Math.random() * 1 + 0.5}s ease-out forwards`;
            container.appendChild(p);
        }
    }

    setTimeout(() => {
        overlay.style.opacity = "0";
        setTimeout(() => {
            overlay.remove();
            callback();
        }, 500);
    }, 1500);
}
window.setUltimateDisguise = (cardId) => {
    state.ultimateDisguise = cardId;
    saveState();
    
    // Si on est dans l'onglet Master, on rafraichit la vue
    const masterBtn = document.getElementById('nav-master');
    if (masterBtn && masterBtn.classList.contains('active')) {
        renderMasterTab();
    } else {
        renderInventory();
    }
    
    const modal = document.querySelector('div[style*="z-index: 2000000"]');
    if (modal) modal.remove();
};

function renderOnlyIcon(card) {
    const rarity = getCardRarity(card);
    const rarityClass = `rarity-${rarity.toString().replace('.', '-')}`;
    
    // Ajout des classes d'effets pour que les icônes dans le craft soient cohérentes
    let effectClass = '';
    if (card.type === 'gold') effectClass = 'effect-gold';
    else if (card.type === 'green_gold') effectClass = 'effect-green-gold';
    else if (card.type === 'red_gold') effectClass = 'effect-red-gold';
    else if (card.type === 'blue_dark_gold') effectClass = 'effect-blue-dark-gold';
    else if (card.type === 'immersive') effectClass = 'effect-immersive';
    else if (card.type === 'immersive_orange_dark') effectClass = 'effect-immersive-orange';
    else if (card.type === 'secret') effectClass = 'effect-secret';
    else if (card.type === 'ultimate') effectClass = 'effect-ultimate';

    return `<div class="mc-slot-item ${rarityClass} ${effectClass}">
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

window.deleteChatMessage = async (msgId) => {
    if (confirm("Supprimer ce message ?")) {
        try {
            await db.collection('messages').doc(msgId).delete();
        } catch (e) {
            console.error("Erreur suppression message:", e);
        }
    }
};

window.adminClearChat = async () => {
    if (!confirm("⚠️ VOULEZ-VOUS VRAIMENT VIDER TOUT LE CHAT ?")) return;
    
    try {
        const snap = await db.collection('messages').get();
        const batch = db.batch();
        snap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        alert("Chat entièrement vidé !");
        renderAdminView();
    } catch (e) {
        console.error("Erreur vidage chat:", e);
        alert("Une erreur est survenue lors du vidage.");
    }
};

function updateChatCardPicker() {
    const picker = document.getElementById('chat-card-picker');
    if (!picker) return;

    const counts = getInventoryCounts();
    const uniqueIds = Object.keys(counts);
    
    // Transformer les IDs en objets de cartes et trier par rareté décroissante
    const displayList = uniqueIds.map(id => {
        let card = cards.find(c => c.id === id);
        if (id === '999' && !card) {
            card = { id: '999', type: 'ultimate', name: "THE MASTER COLLECTION" };
        }
        return card;
    })
    .filter(c => c)
    .sort((a, b) => getCardRarity(b) - getCardRarity(a) || a.name.localeCompare(b.name));

    picker.innerHTML = displayList.map(card => {
        const rarity = getCardRarity(card);
        const rarityClass = `rarity-${rarity.toString().replace('.', '-')}`;

        return `
            <div class="mini-item-pick ${rarityClass}" style="width: 50px; height: 50px; cursor: pointer;" onclick="sendCardToChat('${card.id}')">
                ${renderOnlyIcon(card)}
            </div>
        `;
    }).join('');
}

window.toggleChatCardPicker = () => {
    const picker = document.getElementById('chat-card-picker');
    if (picker.style.display === 'grid') {
        picker.style.display = 'none';
    } else {
        picker.style.display = 'grid';
        updateChatCardPicker();
    }
};

window.sendCardToChat = async (cardId) => {
    const user = auth.currentUser;
    if (!user) return;
    
    document.getElementById('chat-card-picker').style.display = 'none';
    
    const messageData = {
        senderId: user.uid,
        senderEmail: user.email,
        cardId: cardId,
        text: "regarder ce que jai !",
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Si c'est l'Ultimate, on envoie le déguisement actuel
    if (cardId === '999' && state.ultimateDisguise) {
        messageData.disguiseId = state.ultimateDisguise;
    }
    
    try {
        await db.collection('messages').add(messageData);
    } catch (e) {
        console.error("Erreur d'envoi de carte:", e);
    }
};

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
            prestige: state.prestige || 0,
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

function renderMasterTab() {
    if (state.isOpening) return;
    document.getElementById('sort-controls').style.display = 'none';
    const content = document.getElementById('content');

    const counts = getInventoryCounts();
    const hasMaster = !!counts['999'];
    const isPrestige = (state.prestige || 0) > 0;

    if (!hasMaster && !isPrestige) {
        content.innerHTML = `<h2 style="color:white; text-align:center; margin-top:50px;">Vous n'avez pas encore débloqué le Menu Maître.</h2>`;
        return;
    }

    let prestigeBtn = '';
    let masterSkinSection = '';

    if (hasMaster) {
        if (!isPrestige) {
            prestigeBtn = `<button onclick="passPrestige()" style="margin-top:20px; background:#f1c40f; color:#000; font-size:1.5rem; padding:20px 40px; border:4px solid #fff; box-shadow: 0 0 20px #f1c40f; cursor:pointer; font-weight:bold;">SACRIFIER POUR PRESTIGE 1</button>`;
        } else {
            prestigeBtn = `<div style="color:#f1c40f; font-size:1.5rem; margin-top:20px; text-shadow: 0 0 10px #f1c40f; font-weight:bold;">VOUS ÊTES PRESTIGE ${state.prestige} (MAÎTRE RECONSTITUÉ)</div>`;
        }

        const sortedCards = [...cards]
            .filter(c => c.id !== '999' && c.type !== 'secret')
            .sort((a, b) => getCardRarity(a) - getCardRarity(b) || a.name.localeCompare(b.name));

        masterSkinSection = `
            <div style="margin-bottom: 50px;">
                <h3 style="color:#3498db; margin-bottom:20px; text-transform:uppercase; letter-spacing:2px;">SKIN DE LA MASTER CARD</h3>
                <div class="inventory-grid-scroll" style="width:100%; max-width:1000px; margin: 0 auto; background:#111; padding:20px; border:4px solid #000; display:grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap:15px; max-height: 400px; overflow-y: auto; box-shadow: inset 0 0 20px #000;">
                    <div onclick="setUltimateDisguise(null)" class="mini-item-pick" style="border-color:#555; color:white; font-size:0.6rem; text-align:center; background:#222; cursor:pointer; display:flex; align-items:center; justify-content:center; aspect-ratio:1;">RESET SKIN</div>
                    ${sortedCards.map(c => {
                        const rarity = getCardRarity(c);
                        const rarityClass = `rarity-${rarity.toString().replace('.', '-')}`;
                        return `
                            <div class="mini-item-pick ${rarityClass}" onclick="setUltimateDisguise('${c.id}')" style="cursor:pointer; padding:5px;">
                                ${renderOnlyIcon(c)}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    } else {
        prestigeBtn = `
            <div style="color:#f1c40f; font-size:1.5rem; margin-top:20px; text-shadow: 0 0 10px #f1c40f; font-weight:bold;">VOUS ÊTES PRESTIGE ${state.prestige}</div>
            <p style="color:#fff; margin-top:20px; font-size:1.1rem;">La Master Card a été sacrifiée. Collectez toutes les cartes <b>Ascension</b> pour la récupérer !</p>
        `;
    }

    content.innerHTML = `
        <div style="text-align:center; padding:40px; background: rgba(0,0,0,0.5); border: 4px solid #8e44ad; margin-top: 20px; box-shadow: 0 0 30px rgba(142, 68, 173, 0.3);">
            <h2 style="color:white; margin-bottom:40px; text-transform:uppercase; letter-spacing:4px; text-shadow: 0 0 10px #fff;">LE REPAIRE DU MAÎTRE</h2>

            ${masterSkinSection}

            <div style="margin-top: 50px; border-top: 2px solid #555; padding-top: 40px;">
                <h3 style="color:#f1c40f; margin-bottom:20px; text-transform:uppercase; letter-spacing:2px;">ASCENSION</h3>
                ${prestigeBtn}
            </div>
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
        { id: 'nav-market', func: renderMarketView },
        { id: 'nav-master', func: renderMasterTab },
        { id: 'nav-admin', func: renderAdminView },
        { id: 'nav-beta', func: renderBetaView }
    ];
    navs.forEach(nav => {
        const btn = document.getElementById(nav.id);
        if (btn) {
            btn.onclick = (e) => {
                if (state.isOpening) return;
                
                // Nettoyage des listeners quand on change d'onglet
                isChatActive = (nav.id === 'nav-chat');
                isTradeActive = (nav.id === 'nav-trade');
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

window.startUltimateEffect = () => {
    if (document.getElementById('ultimate-ascension-overlay')) return;
    
    // Activer l'effet sur toutes les cartes (Aura Prestige si prestige > 0)
    if (state.prestige > 0) {
        document.body.classList.add('prestige-aura-active');
    } else {
        document.body.classList.add('ultimate-active');
    }

    // Créer l'overlay
    const overlay = document.createElement('div');
    overlay.id = 'ultimate-ascension-overlay';
    
    const titleText = state.prestige > 0 ? `PRESTIGE ${state.prestige}` : "VOUS ÊTES LE MAÎTRE";
    const subTitleText = state.prestige > 0 ? "LE POUVOIR DORÉ EST VÔTRE" : "Bravo d'avoir complété toute la collection";
    
    overlay.innerHTML = `
        <div class="ascension-rays"></div>
        <div class="ascension-title" style="${state.prestige > 0 ? 'text-shadow: 0 0 20px #ffd700, 0 0 40px #ffd700, 0 0 60px #ffaa00;' : ''}">${titleText}</div>
        <div class="ascension-subtitle" style="${state.prestige > 0 ? 'color: #ffd700; text-shadow: 0 0 10px #ffaa00;' : ''}">${subTitleText}</div>
    `;
    
    // Ajouter des particules cosmiques plus intenses
    for(let i=0; i<120; i++) {
        const p = document.createElement('div');
        p.className = 'cosmic-particle';
        const size = Math.random() * 5 + 2;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.left = '50%';
        p.style.top = '50%';
        
        if (state.prestige > 0) {
            p.style.background = Math.random() > 0.5 ? '#fff' : '#ffd700';
        } else {
            p.style.background = Math.random() > 0.5 ? '#fff' : '#00d2ff';
        }
        p.style.boxShadow = `0 0 10px ${p.style.background}`;
        
        const angle = Math.random() * Math.PI * 2;
        const dist = 50 + Math.random() * 100;
        p.style.setProperty('--tx', (Math.cos(angle) * dist) + 'vw');
        p.style.setProperty('--ty', (Math.sin(angle) * dist) + 'vh');
        
        const duration = Math.random() * 2 + 1;
        p.style.animation = `particle-fly ${duration}s linear infinite`;
        overlay.appendChild(p);
    }

    document.body.appendChild(overlay);
    
    // Fermer au clic
    overlay.onclick = stopUltimateEffect;

    // Forcer l'affichage immédiat
    requestAnimationFrame(() => {
        overlay.classList.add('active');
    });
};

window.stopUltimateEffect = () => {
    const overlay = document.getElementById('ultimate-ascension-overlay');
    
    // Retirer l'effet sur toutes les cartes
    document.body.classList.remove('ultimate-active');
    document.body.classList.remove('prestige-aura-active');

    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => {
            if (!overlay.classList.contains('active')) {
                overlay.remove();
            }
        }, 300);
    }
};

window.adminGivePrestigeCards = () => {
    const prestigeCards = cards.filter(c => c.category === 'Ascension');
    prestigeCards.forEach(c => {
        state.inventory.push({ id: c.id, obtainedAt: Date.now() });
    });
    saveState();
    alert("Toutes les cartes Ascension ont été ajoutées !");
    renderInventory();
};

