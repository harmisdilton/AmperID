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
const scrollToTopBtn = document.getElementById('scroll-to-top');

// Context Menu Elements
const ctxMoveBtn = document.getElementById('ctx-move-btn');
const ctxDeleteBtn = document.getElementById('ctx-delete-btn');
const closeCtxMenu = document.getElementById('close-ctx-menu');

// Move Bar Elements
const moveDocName = document.getElementById('move-doc-name');
const finalizeMoveBtn = document.getElementById('finalize-move-btn');
const cancelMoveBtn = document.getElementById('cancel-move-btn');
const profileTextEl = document.getElementById('user-profile-text');

// State
let searchTerm = "";
let currentView = "all"; 
let currentFolderId = null; 
let newlyCreatedFolderId = null;
let movingDocId = null; // ID of doc being moved

// Navigation
let folderBackStack = [];
let folderForwardStack = [];

// --- Translation ---
const translations = {
    hy: {
        search_placeholder: "Փնտրել փաստաթուղթ...",
        tab_all: "Բոլոր փաստաթղթերը",
        tab_folders: "Թղթապանակներ",
        nav_path_root: "Թղթապանակներ",
        ctx_move: "📁 Ավելացնել թղթապանակում",
        ctx_delete: "🗑️ Ջնջել",
        ctx_cancel: "Չեղարկել",
        move_save: "Պահպանել այստեղ",
        move_cancel: "Չեղարկել",
        account_title: "Իմ հաշիվը",
        show_profile: "Իմ մասին (AI)",
        reset_data: "Ջնջել բոլոր տվյալները",
        about_me_title: "Իմ մասին",
        about_me_loading: "Պրոֆիլը բեռնվում է...",
        about_me_generating: "Պրոֆիլը գեներացվում է... (սպասեք 5-10 վրկ)",
        about_me_empty: "Ավելացրեք փաստաթղթեր՝ ձեր պրոֆիլը ստեղծելու համար:",
        about_me_disclaimer: "* Այս տեքստը ստեղծվել է AI-ի կողմից՝ հիմնվելով ձեր բոլոր փաստաթղթերի վրա:",
        close: "Փակել",
        new_doc_title: "Նոր փաստաթուղթ",
        capture_btn: "Նկարել",
        gallery_btn: "Պատկերասրահ",
        save_doc: "Պահպանել փաստաթուղթը",
        cancel: "Չեղարկել",
        detail_data: "Տվյալներ",
        add_field_btn: "+ Ավելացնել դաշտ ձեռքով",
        copy_data: "Պատճենել տվյալները",
        save_changes: "Պահպանել փոփոխությունները",
        download_pdf: "Ներբեռնել PDF",
        share_pdf: "Ուղարկել PDF",
        delete: "Ջնջել",
        delete_options: "Ջնջելու տարբերակներ",
        delete_description: "Ինչպե՞ս եք ցանկանում վարվել այս փաստաթղթի հետ?",
        rm_from_folder: "Հեռացնել միայն թղթապանակից",
        delete_completely: "Ջնջել ամբողջությամբ",
        ai_suggest: "ԻԻ Առաջարկ ✨",
        ai_suggest_desc: "ԻԻ-ն համարում է, որ այս փաստաթղթի համար լավագույն տեղն է՝",
        ai_suggest_confirm: "Ցանկանո՞ւմ եք անմիջապես տեղափոխել այնտեղ?",
        yes_move: "Այո, տեղափոխել",
        no_stay: "Ոչ, թողնել այստեղ",
        processing_pages: "Ուղարկում է {n} էջ...",
        ai_processing: "ԻԻ-ն սկանավորում և կտրում է... (սպասեք 10-20 վրկ)",
        saving_db: "Պահպանում է բազայում...",
        confirm_reset: "Զգուշացում: Այս գործողությունը կջնջի ԲՈԼՈՐ փաստաթղթերը և թղթապանակները: Շարունակե՞լ:",
        confirm_delete_doc: "Ջնջե՞լ \"{t}\" փաստաթուղթը:",
        confirm_delete_folder: "Ջնջե՞լ \"{t}\" թղթապանակը:",
        new_folder_placeholder: "Նոր թղթապանակ",
        empty_view: "Թղթապանակներ դեռ չկան",
        empty_folder: "Թղթապանակը դատարկ է",
        saved_msg: "Պահպանված է",
        error_ai: "Սխալ՝ ԻԻ մշակման ընթացքում:",
        error_conn: "Սխալ՝ կապի ընթացքում:",
        no_name: "Անուն չկա",
        doc_default_name: "Նոր փաստաթուղթ",
        loader_default: "Մշակվում է...",
        field_name_label: "Դաշտի անուն (օր. Անուն)",
        field_val_label: "Արժեքը",
        moved_msg: "Փաստաթուղթը տեղափոխված է:",
        move_info_prefix: "Տեղափոխել: ",
        privacy_policy_btn: "Գաղտնիության քաղաքականություն",
        privacy_policy_title: "Գաղտնիության քաղաքականություն",
        privacy_policy_text: "AmperID-ն առաջնահերթություն է տալիս ձեր գաղտնիությանը: Բոլոր ձեր փաստաթղթերը և տվյալները պահպանվում են բացառապես ձեր սարքի վրա (Local Storage): Մենք չունենք սերվերային տվյալների բազա ձեր անձնական տվյալների համար: AI-ի մշակման ժամանակ պատկերները ուղարկվում են միայն վերլուծության համար և չեն պահպանվում սերվերում: Դուք ցանկացած պահի կարող եք ջնջել բոլոր տվյալները «Ջնջել բոլոր տվյալները» կոճակի միջոցով:",
        flag: "🇦🇲"
    },
    ru: {
        search_placeholder: "Поиск документов...",
        tab_all: "Все документы",
        tab_folders: "Папки",
        nav_path_root: "Папки",
        ctx_move: "📁 Добавить в папку",
        ctx_delete: "🗑️ Удалить",
        ctx_cancel: "Отмена",
        move_save: "Сохранить здесь",
        move_cancel: "Отмена",
        account_title: "Мой аккаунт",
        show_profile: "Обо мне (AI)",
        reset_data: "Удалить все данные",
        about_me_title: "Обо мне",
        about_me_loading: "Профиль загружается...",
        about_me_generating: "Профиль создается... (жди 5-10 сек)",
        about_me_empty: "Добавьте документы, чтобы создать профиль.",
        about_me_disclaimer: "* Этот текст создан ИИ на основе ваших документов.",
        close: "Закрыть",
        new_doc_title: "Новый документ",
        capture_btn: "Снять",
        gallery_btn: "Галерея",
        save_doc: "Сохранить документ",
        cancel: "Отмена",
        detail_data: "Данные",
        add_field_btn: "+ Добавить поле вручную",
        copy_data: "Копировать данные",
        save_changes: "Сохранить изменения",
        download_pdf: "Скачать PDF",
        share_pdf: "Отправить PDF",
        delete: "Удалить",
        delete_options: "Варианты удаления",
        delete_description: "Как вы хотите поступить с этим документом?",
        rm_from_folder: "Удалить только из папки",
        delete_completely: "Удалить полностью",
        ai_suggest: "Предложение ИИ ✨",
        ai_suggest_desc: "ИИ считает, что лучшее место для этого документа:",
        ai_suggest_confirm: "Хотите переместить его туда?",
        yes_move: "Да, переместить",
        no_stay: "Нет, оставить здесь",
        processing_pages: "Отправка {n} стр...",
        ai_processing: "ИИ сканирует... (жди 10-20 сек)",
        saving_db: "Сохранение в базу...",
        confirm_reset: "Предупреждение: Это удалит ВСЕ документы и папки. Продолжить?",
        confirm_delete_doc: "Удалить документ \"{t}\"?",
        confirm_delete_folder: "Удалить папку \"{t}\"?",
        new_folder_placeholder: "Новая папка",
        empty_view: "Папок пока нет",
        empty_folder: "Папка пуста",
        saved_msg: "Сохранено",
        error_ai: "Ошибка при обработке ИИ:",
        error_conn: "Ошибка связи:",
        no_name: "Без имени",
        doc_default_name: "Новый документ",
        loader_default: "Обработка...",
        field_name_label: "Имя поля (напр. Имя)",
        field_val_label: "Значение",
        moved_msg: "Документ перемещен.",
        move_info_prefix: "Переместить: ",
        privacy_policy_btn: "Политика конфиденциальности",
        privacy_policy_title: "Политика конфиденциальности",
        privacy_policy_text: "AmperID уделяет первостепенное внимание вашей конфиденциальности. Все ваши документы и данные хранятся исключительно на вашем устройстве (Локальное хранилище). У нас нет серверной базы данных для ваших личных данных. При обработке ИИ изображения отправляются только для анализа и не сохраняются на сервере. Вы можете в любой момент удалить все свои данные с помощью кнопки «Удалить все данные».",
        flag: "🇷🇺"
    },
    en: {
        search_placeholder: "Search documents...",
        tab_all: "All Documents",
        tab_folders: "Folders",
        nav_path_root: "Folders",
        ctx_move: "📁 Add to folder",
        ctx_delete: "🗑️ Delete",
        ctx_cancel: "Cancel",
        move_save: "Save here",
        move_cancel: "Cancel",
        account_title: "My Account",
        show_profile: "About Me (AI)",
        reset_data: "Reset Alt Data",
        about_me_title: "About Me",
        about_me_loading: "Loading profile...",
        about_me_generating: "Generating profile... (wait 5-10s)",
        about_me_empty: "Add documents to generate your profile.",
        about_me_disclaimer: "* This text is generated by AI based on your documents.",
        close: "Close",
        new_doc_title: "New Document",
        capture_btn: "Capture",
        gallery_btn: "Gallery",
        save_doc: "Save Document",
        cancel: "Cancel",
        detail_data: "Data Fields",
        add_field_btn: "+ Add field manually",
        copy_data: "Copy Data",
        save_changes: "Save Changes",
        download_pdf: "Download PDF",
        share_pdf: "Send PDF",
        delete: "Delete",
        delete_options: "Delete Options",
        delete_description: "How would you like to handle this document?",
        rm_from_folder: "Remove from folder only",
        delete_completely: "Delete completely",
        ai_suggest: "AI Suggestion ✨",
        ai_suggest_desc: "AI thinks the best place for this is:",
        ai_suggest_confirm: "Would you like to move it there now?",
        yes_move: "Yes, move it",
        no_stay: "No, keep it here",
        processing_pages: "Uploading {n} pages...",
        ai_processing: "AI scanning... (wait 10-20s)",
        saving_db: "Saving to database...",
        confirm_reset: "Warning: This will delete ALL documents and folders. Continue?",
        confirm_delete_doc: "Delete document \"{t}\"?",
        confirm_delete_folder: "Delete folder \"{t}\"?",
        new_folder_placeholder: "New Folder",
        empty_view: "No folders yet",
        empty_folder: "Folder is empty",
        saved_msg: "Saved",
        error_ai: "AI Processing Error:",
        error_conn: "Connection error:",
        no_name: "No Name",
        doc_default_name: "New Document",
        loader_default: "Processing...",
        field_name_label: "Field name (e.g. Name)",
        field_val_label: "Value",
        moved_msg: "Document moved.",
        move_info_prefix: "Move: ",
        privacy_policy_btn: "Privacy Policy",
        privacy_policy_title: "Privacy Policy",
        privacy_policy_text: "AmperID prioritizes your privacy. All your documents and data are stored exclusively on your device (Local Storage). We do not have a server-side database for your personal data. During AI processing, images are sent only for analysis and are not stored on the server. You can delete all your data at any time via the 'Reset All Data' button.",
        flag: "🇺🇸"
    }
};

let currentLang = localStorage.getItem('amp_lang') || 'hy';

function t(key, params = {}) {
    let str = translations[currentLang][key] || key;
    for (const [k, v] of Object.entries(params)) {
        str = str.replace(`{${k}}`, v);
    }
    return str;
}

/**
 * Helpler to get the correct document title based on the current language
 */
function getDocTitle(doc, lang = currentLang) {
    if (!doc.fields_json) return doc.title;
    
    const fieldsRaw = doc.fields_json;
    if (fieldsRaw[lang] && fieldsRaw[lang].title) {
        return fieldsRaw[lang].title;
    }
    
    // Fallback order: Current Lang -> Armenian -> Stored Title
    return fieldsRaw['hy']?.title || doc.title || t('doc_default_name');
}

function initLangSwitcher() {
    const trigger = document.getElementById('lang-menu-trigger');
    const dropdown = document.getElementById('lang-dropdown');
    const flagEl = document.getElementById('current-lang-flag');

    trigger.onclick = (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
    };

    document.querySelectorAll('.lang-option').forEach(opt => {
        opt.onclick = () => {
            const lang = opt.dataset.lang;
            setLanguage(lang);
            dropdown.classList.add('hidden');
        };
    });

    document.addEventListener('click', () => dropdown.classList.add('hidden'));
    
    // Initial flag
    flagEl.innerText = translations[currentLang].flag;
}

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('amp_lang', lang);
    document.getElementById('current-lang-flag').innerText = translations[lang].flag;
    updateStaticTranslations();
    renderDocuments();
}

function updateStaticTranslations() {
    // Basic elements
    document.getElementById('search-input').placeholder = t('search_placeholder');
    document.getElementById('tab-all').innerText = t('tab_all');
    document.getElementById('tab-folders').innerText = t('tab_folders');
    document.getElementById('loader-status').innerText = t('loader_default');
    
    // Modals
    document.querySelector('#user-menu-modal h2').innerText = t('account_title');
    document.getElementById('show-profile-btn').innerText = t('show_profile');
    document.getElementById('show-privacy-btn').innerText = t('privacy_policy_btn');
    document.getElementById('reset-all-data-btn').innerText = t('reset_data');

    document.getElementById('profile-title-text').innerText = t('about_me_title');
    document.getElementById('profile-disclaimer').innerText = t('about_me_disclaimer');
    document.getElementById('close-profile-btn').innerText = t('close');

    document.getElementById('privacy-title-text').innerText = t('privacy_policy_title');
    document.getElementById('close-privacy-btn').innerText = t('close');
    
    document.querySelector('#upload-modal h2').innerText = t('new_doc_title');
    document.querySelector('.camera-btn:not(.secondary)').firstChild.textContent = t('capture_btn') + " ";
    document.querySelector('.camera-btn.secondary').firstChild.textContent = t('gallery_btn') + " ";
    document.getElementById('process-batch-btn').innerText = t('save_doc');
    document.getElementById('close-modal').innerText = t('cancel');
    
    document.getElementById('show-add-field').innerText = t('add_field_btn');
    document.getElementById('copy-doc-data').innerText = t('copy_data');
    document.getElementById('save-doc-changes').innerText = t('save_changes');
    document.getElementById('download-pdf').innerText = t('download_pdf');
    document.getElementById('share-pdf').innerText = t('share_pdf');
    document.getElementById('delete-doc').innerText = t('delete');
    
    document.querySelector('#delete-choice-modal h2').innerText = t('delete_options');
    document.querySelector('#delete-choice-modal p').innerText = t('delete_description');
    document.getElementById('remove-from-folder-btn').innerText = t('rm_from_folder');
    document.getElementById('delete-completely-btn').innerText = t('delete_completely');
    document.getElementById('cancel-delete-btn').innerText = t('cancel');
    
    document.querySelector('#smart-suggest-modal h2').innerText = t('ai_suggest');
    document.querySelector('#smart-suggest-modal p:nth-of-type(1)').firstChild.textContent = t('ai_suggest_desc') + " ";
    document.querySelector('#smart-suggest-modal p:nth-of-type(2)').innerText = t('ai_suggest_confirm');
    document.getElementById('confirm-smart-move-btn').innerText = t('yes_move');
    document.getElementById('reject-smart-move-btn').innerText = t('no_stay');
    
    // Context Menu
    document.getElementById('ctx-move-btn').innerText = t('ctx_move');
    document.getElementById('ctx-delete-btn').innerText = t('ctx_delete');
    document.getElementById('close-ctx-menu').innerText = t('ctx_cancel');

    // Move Bar
    document.getElementById('finalize-move-btn').innerText = t('move_save');
    document.getElementById('cancel-move-btn').innerText = t('move_cancel');
    
    // Detail Modal Placeholders
    document.getElementById('new-field-key').placeholder = t('field_name_label');
    document.getElementById('new-field-val').placeholder = t('field_val_label');
}

// --- Initialization ---

window.onload = () => {
    initLangSwitcher();
    updateStaticTranslations();
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
            alert(t('moved_msg'));
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
    // Check if we have documents to generate FROM
    const allDocs = await db.documents.toArray();
    if (allDocs.length === 0) {
        profileTextEl.innerText = t('about_me_empty');
        return;
    }

    try {
        profileTextEl.innerText = t('about_me_generating');
        
        // OPTIMIZATION: Only send the essential fields to the AI, removing heavy base64 strings
        const essentialDocsData = allDocs.map(d => ({
            title: d.title,
            fields_json: d.fields_json
        }));

        const res = await fetch('/api/process/generate-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(essentialDocsData)
        });
        const data = await res.json();
        const profileData = data.profile || {};
        profileTextEl.innerText = profileData[currentLang] || profileData['hy'] || t('error_conn');
    } catch (e) {
        console.error("Profile Error:", e);
        profileTextEl.innerText = t('error_conn');
    }
};

document.getElementById('close-profile').onclick = () => profileModal.classList.add('hidden');
document.getElementById('close-profile-btn').onclick = () => profileModal.classList.add('hidden');

// Privacy Policy Modal Logic
const privacyModal = document.getElementById('privacy-modal');
const privacyTextContent = document.getElementById('privacy-text-content');

document.getElementById('show-privacy-btn').onclick = () => {
    userMenuModal.classList.add('hidden');
    privacyModal.classList.remove('hidden');
    privacyTextContent.innerText = t('privacy_policy_text');
};

document.getElementById('close-privacy').onclick = () => privacyModal.classList.add('hidden');
document.getElementById('close-privacy-btn').onclick = () => privacyModal.classList.add('hidden');

document.getElementById('reset-all-data-btn').onclick = async () => {
    if (confirm(t('confirm_reset'))) {
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
                if (confirm(t('confirm_delete_doc', {t: doc.title}))) {
                    await db.documents.delete(doc.id);
                    choiceModal.classList.add('hidden');
                    renderDocuments();
                }
            };
            
            document.getElementById('close-delete-choice').onclick = () => choiceModal.classList.add('hidden');
            document.getElementById('cancel-delete-btn').onclick = () => choiceModal.classList.add('hidden');
        } else {
            // Normal root deletion
            if (confirm(t('confirm_delete_doc', {t: doc.title}))) {
                await db.documents.delete(doc.id);
                renderDocuments();
            }
        }
    };

    ctxMoveBtn.onclick = () => {
        movingDocId = doc.id;
        moveDocName.innerText = t('move_info_prefix') + doc.title;
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
                docList.innerHTML = `<p style="text-align:center; grid-column:1/-1; color:gray; margin-top:2rem;">${t('empty_view')}</p>`;
            }
            folders.forEach(f => renderFolderCard(f));
        } else {
            const folder = await db.folders.get(currentFolderId);
            navBar.classList.remove('hidden');
            document.getElementById('nav-path').innerText = `${t('nav_path_root')} > ${folder.name}`;
            
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
                docList.innerHTML += `<p style="text-align:center; grid-column:1/-1; color:gray; margin-top:2rem;">${t('empty_folder')}</p>`;
            }
        }
    } else {
        navBar.classList.add('hidden');
        let docs = await db.documents.toArray();
        if (searchTerm) {
            docs = docs.filter(d => {
                // Search in current language title
                const currentTitle = getDocTitle(d, currentLang).toLowerCase();
                if (currentTitle.includes(searchTerm)) return true;
                
                // Search in ALL available translations if they exist
                if (d.fields_json) {
                    return Object.values(d.fields_json).some(langData => 
                        langData.title && langData.title.toLowerCase().includes(searchTerm)
                    );
                }
                
                // Fallback to base title
                return d.title.toLowerCase().includes(searchTerm);
            });
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
            const val = input.value.trim() || t('no_name');
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
            if (confirm(t('confirm_delete_folder', {t: folder.name}))) {
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
    const dateLocale = currentLang === 'hy' ? 'hy-AM' : currentLang === 'ru' ? 'ru-RU' : 'en-US';
    const displayTitle = getDocTitle(doc);
    div.innerHTML = `${thumb}<h3>${displayTitle}</h3><p style="font-size:0.7rem; color:gray;">${new Date(doc.created_at).toLocaleDateString(dateLocale)}</p>`;
    
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
    
    const fieldsRaw = doc.fields_json || {};
    let fields = {};
    let displayTitle = getDocTitle(doc);

    // Logic to select fields based on current language or fallback
    if (fieldsRaw[currentLang]) {
        fields = fieldsRaw[currentLang].data;
    } else if (fieldsRaw.տվյալներ) {
        // Fallback for old Armenian-only format
        fields = fieldsRaw.տվյալներ;
    } else {
        // Fallback for unexpected or flat formats
        fields = fieldsRaw;
    }

    detailTitle.innerHTML = `<input type="text" id="edit-doc-title" value="${displayTitle}" class="title-input">`;
    detailFields.innerHTML = '';

    for (const [k, v] of Object.entries(fields)) {
        if (k === 'առաջարկվող_անվանում' || k === 'suggested_folder') continue;
        detailFields.innerHTML += `<div class="field-row"><span class="field-label">${k}</span><input type="text" class="edit-field-val" data-key="${k}" value="${v}" style="width:100%; border:none; font-weight:600;"></div>`;
    }
    document.getElementById('save-doc-changes').onclick = async () => {
        const updates = { title: document.getElementById('edit-doc-title').value.trim() };
        const newFields = doc.fields_json || {};
        
        // Handle both formats: old (flat) and new (translations map)
        if (newFields[currentLang]) {
            document.querySelectorAll('.edit-field-val').forEach(i => {
                newFields[currentLang].data[i.dataset.key] = i.value.trim();
            });
        } else if (newFields.տվյալներ) {
            document.querySelectorAll('.edit-field-val').forEach(i => {
                newFields.տվյալներ[i.dataset.key] = i.value.trim();
            });
        } else {
            // Fallback for simple flat objects if any
             document.querySelectorAll('.edit-field-val').forEach(i => {
                newFields[i.dataset.key] = i.value.trim();
            });
        }

        updates.fields_json = newFields;
        await db.documents.update(id, updates);
        alert(t('saved_msg'));
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
                if (confirm(t('confirm_delete_doc', {t: doc.title}))) {
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
            if (confirm(t('confirm_delete_doc', {t: doc.title}))) { 
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
        const id = await db.folders.add({ name: t('new_folder_placeholder'), parent_id: currentFolderId, created_at: new Date().toISOString() });
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
            div.innerHTML = `<img src="${ev.target.result}"><button class="remove-p">${t('delete')}</button>`;
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
    if (statusText) statusText.innerText = t('processing_pages', {n: selectedFiles.length});
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
        if (statusText) statusText.innerText = t('ai_processing');
        const res = await fetch('/api/process/process-doc', { 
            method: 'POST', 
            body: fd 
        });
        
        if (!res.ok) throw new Error("Processing failed");
        
        const result = await res.json();
        
        if (result.status === 'success') {
            if (statusText) statusText.innerText = t('saving_db');
            
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
                title: result.extracted_fields[currentLang]?.title || result.extracted_fields['hy']?.title || t('doc_default_name'),
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
        alert(t('error_ai'));
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

// --- Global Scroll Logic ---
window.onscroll = () => {
    if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
        scrollToTopBtn.classList.remove('v-hidden');
    } else {
        scrollToTopBtn.classList.add('v-hidden');
    }
};

scrollToTopBtn.onclick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Initial state
renderDocuments();
// updateStaticTranslations(); // Initial translation update
