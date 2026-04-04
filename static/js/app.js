const db = new Dexie("ArmperID_DB");
// Update schema to v6 to force re-migration of parent_id and folder_id
db.version(6).stores({
    documents: "++id, title, folder_id, created_at",
    folders: "++id, name, parent_id, created_at",
    user_meta: "id, bio"
}).upgrade(async tx => {
    // Migration: ensuring ALL existing folders have parent_id: null if not set
    await tx.table("folders").toCollection().modify(f => {
        if (f.parent_id === undefined || f.parent_id === 'null') f.parent_id = null;
    });
    // Migration: ensuring ALL existing documents have folder_id: null if not set
    await tx.table("documents").toCollection().modify(d => {
        if (d.folder_id === undefined || d.folder_id === 'null') d.folder_id = null;
    });
});

// DOM Elements
const docList = document.getElementById('document-list');
const uploadModal = document.getElementById('upload-modal');
const detailModal = document.getElementById('detail-modal');
const userMenuModal = document.getElementById('user-menu-modal');
const profileModal = document.getElementById('profile-modal');
const ctxMenuModal = document.getElementById('context-menu-modal');
const moveActionBar = document.getElementById('move-action-bar');

const closeModal = document.getElementById('close-modal');
const closeDetail = document.getElementById('close-detail');
const floatingAddBtn = document.getElementById('floating-add-btn');
const logoTrigger = document.getElementById('logo-menu-trigger');
const searchInput = document.getElementById('search-input');
const loader = document.getElementById('loader');
const detailTitle = document.getElementById('detail-title');
const detailFields = document.getElementById('detail-fields');

// Context Menu Elements
const ctxMoveBtn = document.getElementById('ctx-move-btn');
const ctxDeleteBtn = document.getElementById('ctx-delete-btn');
const closeCtxMenu = document.getElementById('close-ctx-menu');

// Move Bar Elements
const moveDocName = document.getElementById('move-doc-name');
const finalizeMoveBtn = document.getElementById('finalize-move-btn');
const cancelMoveBtn = document.getElementById('cancel-move-btn');

// State
let searchTerm = "";
let currentView = "all"; 
let currentFolderId = null; 
let newlyCreatedFolderId = null;
let movingDocId = null; // ID of doc being moved

// Navigation
let folderBackStack = [];
let folderForwardStack = [];

// --- Initialization ---

window.onload = () => {
    initTabs();
    initFolderNav();
    initContextUI();
    renderDocuments();
};

function initFolderNav() {
    document.getElementById('nav-back').onclick = goFolderBack;
    document.getElementById('nav-forward').onclick = goFolderForward;
}

function initContextUI() {
    closeCtxMenu.onclick = () => ctxMenuModal.classList.add('hidden');
    cancelMoveBtn.onclick = () => {
        movingDocId = null;
        moveActionBar.classList.add('hidden');
        renderDocuments();
    };
    finalizeMoveBtn.onclick = async () => {
        if (movingDocId) {
            await db.documents.update(movingDocId, { folder_id: currentFolderId });
            movingDocId = null;
            moveActionBar.classList.add('hidden');
            alert("Փաստաթուղթը տեղափոխված է:");
            renderDocuments();
        }
    };
}

function initTabs() {
    const tabAll = document.getElementById('tab-all');
    const tabFolders = document.getElementById('tab-folders');

    tabAll.onclick = () => {
        if (movingDocId) return; // Prevent switching while moving
        currentView = "all";
        currentFolderId = null;
        folderBackStack = [];
        folderForwardStack = [];
        tabAll.classList.add('active');
        tabFolders.classList.remove('active');
        renderDocuments();
    };

    tabFolders.onclick = () => {
        currentView = "folders";
        currentFolderId = null;
        folderBackStack = [];
        folderForwardStack = [];
        tabFolders.classList.add('active');
        tabAll.classList.remove('active');
        renderDocuments();
    };
}

// --- Search ---
searchInput.oninput = (e) => {
    searchTerm = e.target.value.toLowerCase().trim();
    renderDocuments();
};

// --- Modals & User Menu ---
logoTrigger.onclick = () => userMenuModal.classList.remove('hidden');
document.getElementById('close-user-menu').onclick = () => userMenuModal.classList.add('hidden');

// Open Profile & Show generated info
document.getElementById('show-profile-btn').onclick = async () => {
    userMenuModal.classList.add('hidden');
    profileModal.classList.remove('hidden');
    const profileTextEl = document.getElementById('user-profile-text');
    
    // Check if we have documents to generate FROM
    const allDocs = await db.documents.toArray();
    if (allDocs.length === 0) {
        profileTextEl.innerText = "Ավելացրեք փաստաթղթեր՝ ձեր պրոֆիլը ստեղծելու համար:";
        return;
    }

    try {
        profileTextEl.innerText = "Պրոֆիլը գեներացվում է... (սպասեք 5-10 վրկ)";
        const res = await fetch('/api/process/generate-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(allDocs)
        });
        const data = await res.json();
        profileTextEl.innerText = data.profile || "Պրոֆիլի թարմացումը ձախողվեց:";
    } catch (e) {
        console.error("Profile Error:", e);
        profileTextEl.innerText = "Սխալ՝ կապի ընթացքում:";
    }
};

document.getElementById('close-profile').onclick = () => profileModal.classList.add('hidden');
document.getElementById('close-profile-btn').onclick = () => profileModal.classList.add('hidden');

document.getElementById('reset-all-data-btn').onclick = async () => {
    if (confirm("Զգուշացում: Այս գործողությունը կջնջի ԲՈԼՈՐ փաստաթղթերը և թղթապանակները: Շարունակե՞լ:")) {
        await db.delete();
        window.location.reload();
    }
};

// --- Navigation ---
async function openFolder(folderId) {
    if (newlyCreatedFolderId) return; 
    if (currentFolderId !== folderId) {
        folderBackStack.push(currentFolderId);
        folderForwardStack = [];
    }
    currentFolderId = folderId;
    renderDocuments();
}

async function goFolderBack() {
    if (folderBackStack.length === 0) {
        if (currentFolderId !== null) {
            currentFolderId = null;
            renderDocuments();
        }
        return;
    }
    folderForwardStack.push(currentFolderId);
    currentFolderId = folderBackStack.pop();
    renderDocuments();
}

function goFolderForward() {
    if (folderForwardStack.length === 0) return;
    folderBackStack.push(currentFolderId);
    currentFolderId = folderForwardStack.pop();
    renderDocuments();
}

// --- Long Press & Context Menu ---

function showDocContextMenu(doc) {
    ctxMenuModal.classList.remove('hidden');
    
    ctxDeleteBtn.onclick = async () => {
        ctxMenuModal.classList.add('hidden'); // Close context menu first

        if (doc.folder_id !== null && doc.folder_id !== undefined) {
            // Show Smart Choice Modal
            const choiceModal = document.getElementById('delete-choice-modal');
            choiceModal.classList.remove('hidden');

            document.getElementById('remove-from-folder-btn').onclick = async () => {
                await db.documents.update(doc.id, { folder_id: null });
                choiceModal.classList.add('hidden');
                renderDocuments();
            };

            document.getElementById('delete-completely-btn').onclick = async () => {
                if (confirm("Ջնջե՞լ ամբողջությամբ:")) {
                    await db.documents.delete(doc.id);
                    choiceModal.classList.add('hidden');
                    renderDocuments();
                }
            };

            document.getElementById('close-delete-choice').onclick = () => choiceModal.classList.add('hidden');
            document.getElementById('cancel-delete-btn').onclick = () => choiceModal.classList.add('hidden');
        } else {
            // Normal root deletion
            if (confirm(`Ջնջե՞լ "${doc.title}" փաստաթուղթը:`)) {
                await db.documents.delete(doc.id);
                renderDocuments();
            }
        }
    };

    ctxMoveBtn.onclick = () => {
        movingDocId = doc.id;
        moveDocName.innerText = `Տեղափոխել: ${doc.title}`;
        ctxMenuModal.classList.add('hidden');
        moveActionBar.classList.remove('hidden');
        // Switch to folders tab automatically
        currentView = "folders";
        currentFolderId = null;
        document.getElementById('tab-folders').classList.add('active');
        document.getElementById('tab-all').classList.remove('active');
        renderDocuments();
    };
}

function addLongPressListener(element, callback) {
    let timer;
    const duration = 700;
    const start = (e) => {
        timer = setTimeout(() => {
            element.classList.add('long-pressing');
            callback();
            // Faster cleanup (100ms) to unblock clicks
            setTimeout(() => element.classList.remove('long-pressing'), 100);
        }, duration);
    };
    const cancel = () => { clearTimeout(timer); element.classList.remove('long-pressing'); };
    element.addEventListener('touchstart', start);
    element.addEventListener('touchend', cancel);
    element.addEventListener('touchmove', cancel);
    element.addEventListener('mousedown', start);
    element.addEventListener('mouseup', cancel);
    element.addEventListener('mouseleave', cancel);
}

// --- Rendering ---

async function renderDocuments() {
    if (!docList) return;
    docList.innerHTML = '';
    const navBar = document.getElementById('folder-nav-bar');
    console.log("Rendering View:", currentView, "at Folder:", currentFolderId);
    
    // Hide FAB during Move Mode to clean up the UI
    floatingAddBtn.classList.toggle('hidden', !!movingDocId);

    if (currentView === "folders") {
        const foldersRaw = await db.folders.toArray();
        console.log("Total Folders in DB:", foldersRaw.length);

        // Show/Hide Save Here button
        if (movingDocId && currentFolderId !== null) {
            finalizeMoveBtn.classList.remove('hidden');
        } else if (movingDocId) {
            finalizeMoveBtn.classList.add('hidden');
        }

        if (currentFolderId === null) {
            navBar.classList.add('hidden');
            const folders = foldersRaw.filter(f => !f.parent_id || f.parent_id === 'null')
                                      .sort((a,b) => b.id - a.id);
            console.log("Root Folders Found:", folders.length);
            
            if (folders.length === 0 && !movingDocId) {
                docList.innerHTML = `<p style="text-align:center; grid-column:1/-1; color:gray; margin-top:2rem;">Թղթապանակներ դեռ չկան</p>`;
            }
            folders.forEach(f => renderFolderCard(f));
        } else {
            const folder = await db.folders.get(currentFolderId);
            navBar.classList.remove('hidden');
            document.getElementById('nav-path').innerText = `Թղթապանակներ > ${folder.name}`;
            
            // Subfolders: Filter where parent_id is currentFolderId
            const foldersRaw = await db.folders.toArray();
            const subfolders = foldersRaw.filter(f => String(f.parent_id) === String(currentFolderId))
                                         .sort((a,b) => b.id - a.id);
            subfolders.forEach(f => renderFolderCard(f));
            
            // Documents in folder
            const docsRaw = await db.documents.toArray();
            const docsInFolder = docsRaw.filter(d => String(d.folder_id) === String(currentFolderId))
                                        .sort((a,b) => b.id - a.id);
            docsInFolder.forEach(d => renderDocCard(d));

            if (subfolders.length === 0 && docsInFolder.length === 0) {
                docList.innerHTML += `<p style="text-align:center; grid-column:1/-1; color:gray; margin-top:2rem;">Թղթապանակը դատարկ է</p>`;
            }
        }
    } else {
        navBar.classList.add('hidden');
        let docs = await db.documents.toArray();
        if (searchTerm) {
            docs = docs.filter(d => d.title.toLowerCase().includes(searchTerm));
        }
        docs.sort((a,b) => b.id - a.id).forEach(d => renderDocCard(d));
    }
}

function renderFolderCard(folder) {
    const card = document.createElement('div');
    card.className = 'folder-card';
    const isNew = folder.id === newlyCreatedFolderId;
    card.innerHTML = `<div class="folder-icon">📁</div>${isNew ? `<input type="text" value="${folder.name}" class="folder-title-input">` : `<div class="folder-name">${folder.name}</div>`}`;
    
    if (isNew) {
        const input = card.querySelector('input');
        setTimeout(() => { input.focus(); input.select(); }, 50);
        const save = async () => {
            const val = input.value.trim() || "Անուն չկա";
            await db.folders.update(folder.id, { name: val });
            newlyCreatedFolderId = null;
            renderDocuments();
        };
        input.onblur = save;
        input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } };
    } else {
        card.onclick = () => {
            if (!card.classList.contains('long-pressing')) {
                openFolder(folder.id);
            }
        };
        
        const folderNameEl = card.querySelector('.folder-name');
        folderNameEl.onclick = (e) => {
            e.stopPropagation();
            startInlineRename(folderNameEl, folder.id, 'folder');
        };

        addLongPressListener(card, async () => {
            if (confirm(`Ջնջե՞լ "${folder.name}" թղթապանակը:`)) {
                await db.folders.delete(folder.id);
                renderDocuments();
            }
        });
    }
    docList.appendChild(card);
}

function renderDocCard(doc) {
    const div = document.createElement('div');
    div.className = 'doc-card';
    const thumb = doc.thumbnail_data ? `<img src="${doc.thumbnail_data}" class="doc-thumbnail">` : `<div class="doc-thumbnail" style="display:flex;align-items:center;justify-content:center;font-size:2rem;">📄</div>`;
    div.innerHTML = `${thumb}<h3>${doc.title}</h3><p style="font-size:0.7rem; color:gray;">${new Date(doc.created_at).toLocaleDateString()}</p>`;
    
    div.onclick = () => { if (!div.classList.contains('long-pressing')) openDetail(doc.id); };
    
    const h3 = div.querySelector('h3');
    h3.onclick = (e) => {
        e.stopPropagation();
        startInlineRename(h3, doc.id, 'document');
    };

    addLongPressListener(div, () => showDocContextMenu(doc));
    docList.appendChild(div);
}

// --- Detail & Global Actions ---

async function openDetail(id) {
    const doc = await db.documents.get(id);
    if (!doc) return;
    detailTitle.innerHTML = `<input type="text" id="edit-doc-title" value="${doc.title}" class="title-input">`;
    detailFields.innerHTML = '';
    const fields = doc.fields_json || {};
    for (const [k, v] of Object.entries(fields)) {
        if (k === 'առաջարկվող_անվանում') continue;
        detailFields.innerHTML += `<div class="field-row"><span class="field-label">${k}</span><input type="text" class="edit-field-val" data-key="${k}" value="${v}" style="width:100%; border:none; font-weight:600;"></div>`;
    }
    document.getElementById('save-doc-changes').onclick = async () => {
        const updates = { title: document.getElementById('edit-doc-title').value.trim() };
        const newFields = {};
        document.querySelectorAll('.edit-field-val').forEach(i => newFields[i.dataset.key] = i.value.trim());
        updates.fields_json = newFields;
        await db.documents.update(id, updates);
        alert("Պահպանված է");
        renderDocuments();
    };
    document.getElementById('download-pdf').onclick = () => { 
        const a = document.createElement('a'); a.href = doc.pdf_data; 
        a.download = `${doc.title}.pdf`; a.click(); 
    };
    document.getElementById('delete-doc').onclick = async () => {
        // Strict check to ensure we catch all folder-bound documents
        if (doc.folder_id !== null && doc.folder_id !== undefined) {
            // Show Choice Modal
            const choiceModal = document.getElementById('delete-choice-modal');
            choiceModal.classList.remove('hidden');

            document.getElementById('remove-from-folder-btn').onclick = async () => {
                await db.documents.update(id, { folder_id: null });
                choiceModal.classList.add('hidden');
                detailModal.classList.add('hidden');
                renderDocuments();
            };

            document.getElementById('delete-completely-btn').onclick = async () => {
                if (confirm("Ջնջե՞լ ամբողջությամբ:")) {
                    await db.documents.delete(id);
                    choiceModal.classList.add('hidden');
                    detailModal.classList.add('hidden');
                    renderDocuments();
                }
            };

            document.getElementById('close-delete-choice').onclick = () => choiceModal.classList.add('hidden');
            document.getElementById('cancel-delete-btn').onclick = () => choiceModal.classList.add('hidden');
            
        } else {
            // Standard root deletion
            if (confirm("Ջնջե՞լ:")) { 
                await db.documents.delete(id); 
                detailModal.classList.add('hidden'); 
                renderDocuments(); 
            }
        }
    };
    document.getElementById('detail-image').src = doc.thumbnail_data || '';
    detailModal.classList.remove('hidden');
}

floatingAddBtn.onclick = async () => {
    if (currentView === "folders") {
        const id = await db.folders.add({ name: "Նոր թղթապանակ", parent_id: currentFolderId, created_at: new Date().toISOString() });
        newlyCreatedFolderId = id;
        renderDocuments();
    } else {
        uploadModal.classList.remove('hidden');
    }
};

closeDetail.onclick = () => detailModal.classList.add('hidden');
let selectedFiles = []; // Temporary array for batch preview

document.getElementById('add-page-gallery').onchange = (e) => handlePreview(e.target.files);
document.getElementById('add-page-camera').onchange = (e) => handlePreview(e.target.files);

function handlePreview(files) {
    const previewGrid = document.getElementById('photo-preview-grid');
    const saveBtn = document.getElementById('process-batch-btn');
    
    for (const file of files) {
        selectedFiles.push(file);
        const reader = new FileReader();
        reader.onload = (ev) => {
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.innerHTML = `<img src="${ev.target.result}"><button class="remove-p">Ջնջել</button>`;
            div.querySelector('.remove-p').onclick = () => {
                selectedFiles = selectedFiles.filter(f => f !== file);
                div.remove();
                if (selectedFiles.length === 0) saveBtn.disabled = true;
            };
            previewGrid.appendChild(div);
        };
        reader.readAsDataURL(file);
    }
    saveBtn.disabled = false;
}

document.getElementById('process-batch-btn').onclick = async () => {
    if (selectedFiles.length === 0) return;
    const statusText = document.getElementById('loader-status');
    if (statusText) statusText.innerText = `Ուղարկում է ${selectedFiles.length} էջ...`;
    loader.classList.remove('hidden');
    uploadModal.classList.add('hidden');

    // NEW: Gather all folder names for AI context
    const folders = await db.folders.toArray();
    const folderNames = folders.map(f => f.name).join(',');

    const fd = new FormData();
    for (const file of selectedFiles) {
        fd.append('files', file);
    }
    if (folderNames) fd.append('folder_names', folderNames);

    try {
        if (statusText) statusText.innerText = "ԻԻ-ն սկանավորում և կտրում է... (սպասեք 10-20 վրկ)";
        const res = await fetch('/api/process/process-doc', { 
            method: 'POST', 
            body: fd 
        });
        
        if (!res.ok) throw new Error("Processing failed");
        
        const result = await res.json();
        
        if (result.status === 'success') {
            if (statusText) statusText.innerText = "Պահպանում է բազայում...";
            
            const suggestedFolderName = result.extracted_fields.suggested_folder;
            let targetFolderId = currentFolderId;

            // Smart Suggestion Logic: Flexible matching for better results
            if (suggestedFolderName && !currentFolderId) {
                const suggested = suggestedFolderName.toLowerCase().trim();
                const match = folders.find(f => {
                    const fName = f.name.toLowerCase().trim();
                    // Match if exact, or if one contains the other (e.g., singular/plural)
                    return fName === suggested || fName.includes(suggested) || suggested.includes(fName);
                });
                
                if (match) {
                    const suggestModal = document.getElementById('smart-suggest-modal');
                    document.getElementById('suggested-folder-name').innerText = match.name;
                    suggestModal.classList.remove('hidden');

                    // Standard blocking wait for user response
                    const choice = await new Promise((resolve) => {
                        document.getElementById('confirm-smart-move-btn').onclick = () => {
                            suggestModal.classList.add('hidden');
                            resolve(match.id);
                        };
                        document.getElementById('reject-smart-move-btn').onclick = () => {
                            suggestModal.classList.add('hidden');
                            resolve(null);
                        };
                        document.getElementById('close-smart-suggest').onclick = () => {
                            suggestModal.classList.add('hidden');
                            resolve(null);
                        };
                    });
                    targetFolderId = choice;
                }
            }

            await db.documents.add({
                title: result.extracted_fields.առաջարկվող_անվանում || "Նոր փաստաթուղթ",
                pdf_data: `data:application/pdf;base64,${result.pdf_base64}`,
                thumbnail_data: `data:image/jpeg;base64,${result.thumbnail_base64}`,
                fields_json: result.extracted_fields,
                folder_id: targetFolderId,
                created_at: new Date().toISOString()
            });
            console.log("Professional AI Processing Complete (Crop + OCR)");
        }
    } catch (e) {
        console.error("Batch OCR Error:", e);
        alert("Սխալ՝ ԻԻ մշակման ընթացքում:");
    } finally {
        // Clear state and UI
        selectedFiles = [];
        document.getElementById('photo-preview-grid').innerHTML = '';
        document.getElementById('process-batch-btn').disabled = true;
        loader.classList.add('hidden');
        renderDocuments();
    }
};

document.getElementById('close-modal').onclick = () => {
    selectedFiles = [];
    document.getElementById('photo-preview-grid').innerHTML = '';
    document.getElementById('process-batch-btn').disabled = true;
    uploadModal.classList.add('hidden');
};

document.getElementById('close-modal-top').onclick = () => {
    selectedFiles = [];
    document.getElementById('photo-preview-grid').innerHTML = '';
    document.getElementById('process-batch-btn').disabled = true;
    uploadModal.classList.add('hidden');
};

async function processAI(docId, file) {
    // Legacy single-page process - now deprecated in favor of batch
    console.log("Legacy AI processor skipped, batch process handles it now.");
}

async function deleteFolder(id) {
    await db.folders.delete(id);
    renderDocuments();
}

function startInlineRename(element, id, type) {
    const currentName = element.innerText;
    const computedStyle = window.getComputedStyle(element);
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = type === 'folder' ? 'folder-title-input' : 'doc-title-input';
    
    // Explicitly copy font size to avoid inheritance/browser issues
    input.style.fontSize = computedStyle.fontSize;
    input.style.fontWeight = computedStyle.fontWeight;
    input.style.fontFamily = computedStyle.fontFamily;
    
    element.replaceWith(input);
    input.focus();
    input.select();

    let isSaving = false;
    const save = async () => {
        if (isSaving) return;
        isSaving = true;
        const newName = input.value.trim() || currentName;
        if (type === 'folder') {
            await db.folders.update(id, { name: newName });
        } else {
            await db.documents.update(id, { title: newName });
        }
        renderDocuments();
    };

    input.onblur = save;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.onblur = null; // Prevent double-save from blur
            save();
        }
        if (e.key === 'Escape') {
            input.onblur = null;
            renderDocuments();
        }
    };
}
