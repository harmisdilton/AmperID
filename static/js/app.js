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
const ctxShareBtn = document.getElementById('ctx-share-btn');
const ctxMoveBtn = document.getElementById('ctx-move-btn');
const ctxDeleteBtn = document.getElementById('ctx-delete-btn');
const closeCtxMenu = document.getElementById('close-ctx-menu');

// Move Bar Elements
const moveDocName = document.getElementById('move-doc-name');
const finalizeMoveBtn = document.getElementById('finalize-move-btn');
const cancelMoveBtn = document.getElementById('cancel-move-btn');
const profileTextEl = document.getElementById('user-profile-text');

// New Modals & Elements
const shareChoiceModal = document.getElementById('share-choice-modal');
const downloadChoiceModal = document.getElementById('download-choice-modal');
const fullImageViewer = document.getElementById('full-image-viewer');
const viewerImg = document.getElementById('viewer-img');

const openShareChoiceBtn = document.getElementById('open-share-choice');
const openDownloadChoiceBtn = document.getElementById('open-download-choice');
const detailImage = document.getElementById('detail-image');

// State
let searchTerm = "";
let currentView = "all";
let currentFolderId = null;
let currentDetailDocId = null;
let newlyCreatedFolderId = null;
let currentSearchMode = "db";
let movingDocId = null;
let isAiSearchMode = false;
let aiRelevantIds = null;
let folderBackStack = [];
let folderForwardStack = [];

// --- Utilities ---
function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    } else {
        // Fallback for non-secure contexts or older browsers
        return new Promise((resolve, reject) => {
            try {
                const textArea = document.createElement("textarea");
                textArea.value = text;
                textArea.style.position = "fixed";
                textArea.style.left = "-9999px";
                textArea.style.top = "0";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                if (successful) resolve();
                else reject(new Error('Copy command failed'));
            } catch (err) {
                reject(err);
            }
        });
    }
}
// --- Translation ---
const translations = {
    hy: {
        search_placeholder: "Փնտրել փաստաթուղթ...",
        tab_all: "Բոլոր փաստաթղթերը",
        tab_folders: "Թղթապանակներ",
        nav_path_root: "Թղթապանակներ",
        ctx_move: "Ավելացնել թղթապանակում",
        ctx_delete: "Ջնջել",
        ctx_cancel: "Չեղարկել",
        move_save: "Պահպանել այստեղ",
        move_cancel: "Չեղարկել",
        account_title: "Իմ հաշիվը",
        show_profile: "Իմ մասին (ԱԲ)",
        reset_data: "Ջնջել բոլոր տվյալները",
        about_me_title: "Իմ մասին",
        about_me_loading: "Պրոֆիլը բեռնվում է...",
        about_me_generating: "Պրոֆիլը գեներացվում է... (սպասեք 5-10 վրկ)",
        about_me_empty: "Ավելացրեք փաստաթղթեր՝ ձեր պրոֆիլը ստեղծելու համար:",
        about_me_disclaimer: "* Այս տեքստը ստեղծվել է ԱԲ-ի կողմից՝ հիմնվելով ձեր բոլոր փաստաթղթերի վրա:",
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
        share_doc: "Ուղարկել AmperID փաստաթուղթ",
        share_qr_desc: "Ցույց տվեք այս QR կոդը կամ ուղարկեք հղումը:",
        security_num_label: "Անվտանգության թիվ",
        security_num_desc: "Խնդրեք ստացողին ընտրել այս թիվը փաստաթղթի էջի տարբերակներից:",
        delete: "Ջնջել",
        delete_options: "Ջնջելու տարբերակներ",
        delete_description: "Ինչպե՞ս եք ցանկանում վարվել այս փաստաթղթի հետ?",
        rm_from_folder: "Հեռացնել միայն թղթապանակից",
        delete_completely: "Ջնջել ամբողջությամբ",
        ai_suggest: "ԱԲ Առաջարկ",
        ai_suggest_desc: "ԱԲ-ն համարում է, որ այս փաստաթղթի համար լավագույն տեղն է՝",
        ai_suggest_confirm: "Ցանկանո՞ւմ եք անմիջապես տեղափոխել այնտեղ?",
        yes_move: "Այո, տեղափոխել",
        no_stay: "Ոչ, թողնել այստեղ",
        ai_search_placeholder: "Հարցրեք ԱԲ-ին ձեր փաստաթղթերի մասին...",
        ai_assistant: "ԱԲ Օգնական",
        ai_thinking: "ԱԲ-ն մտածում է...",
        ai_no_match: "Համապատասխան փաստաթուղթ չի գտնվել:",
        lock_screen_title: "Մուտքագրեք PIN կոդը",
        unlock_btn: "Բացել",
        security_title: "Անվտանգություն",
        security_info: "Սահմանեք 4-նիշանոց PIN կոդ՝ ձեր անձնական փաստաթղթերը պաշտպանելու համար:",
        set_pin: "Սահմանել PIN կոդ",
        remove_pin: "Հեռացնել PIN կոդը",
        enable_bio: "Միացնել Բիոմետրիան",
        pin_success: "PIN կոդը հաջողությամբ սահմանվեց",
        pin_mismatch: "Սխալ PIN կոդ",
        pin_removed: "PIN կոդը հեռացվեց",
        generating_link: "Հղումը ստեղծվում է...",
        error_creating_link: "Հղումը ստեղծելիս սխալ տեղի ունեցավ:",
        reset_all_data: "Ջնջել բոլոր տվյալները",
        processing_pages: "Ուղարկում է {n} էջ...",
        ai_processing: "ԱԲ-ն սկանավորում և կտրում է... (սպասեք 10-20 վրկ)",
        dark_mode_label: "Մութ ռեժիմ",
        lock_app_btn: "Փակել հավելվածը",
        saving_db: "Պահպանում է բազայում...",
        confirm_reset: "Զգուշացում: Այս գործողությունը կջնջի ԲՈԼՈՐ փաստաթղթերը և թղթապանակները: Շարունակե՞լ:",
        confirm_delete_doc: "Ջնջե՞լ \"{t}\" փաստաթուղթը:",
        confirm_delete_folder: "Ջնջե՞լ \"{t}\" թղթապանակը:",
        new_folder_placeholder: "Նոր թղթապանակ",
        empty_view: "Թղթապանակներ դեռ չկան",
        empty_folder: "Թղթապանակը դատարկ է",
        empty_all: "Փաստաթղթեր չկան",
        saved_msg: "Պահպանված է",
        error_ai: "Սխալ՝ ԱԲ մշակման ընթացքում:",
        error_conn: "Սխալ՝ կապի ընթացքում:",
        no_name: "Անուն չկա",
        doc_default_name: "Նոր փաստաթուղթ",
        loader_default: "Մշակվում է...",
        field_name_label: "Դաշտի անուն (օր. Անուն)",
        field_val_label: "Արժեքը",
        moved_msg: "Փաստաթուղթը տեղափոխված է:",
        move_info_prefix: "Տեղափոխել՝ ",
        privacy_policy_btn: "Գաղտնիության քաղաքականություն",
        privacy_policy_title: "Գաղտնիության քաղաքականություն",
        privacy_policy_text: "AmperID-ն առաջնահերթություն է տալիս ձեր գաղտնիությանը: Բոլոր ձեր փաստաթղթերը և տվյալները պահպանվում են բացառապես ձեր սարքի վրա (Local Storage): Մենք չունենք սերվերային տվյալների բազա ձեր անձնական տվյալների համար: ԱԲ-ի մշակման ժամանակ պատկերները ուղարկվում են միայն վերլուծության համար և չեն պահպանվում սերվերում: Դուք ցանկացած պահի կարող եք ջնջել բոլոր տվյալները «Ջնջել բոլոր տվյալները» կոճակի միջոցով:",
        flag: "🇦🇲",
        share: "Կիսվել",
        download: "Ներբեռնել",
        share_options: "Կիսվել...",
        download_options: "Ներբեռնել...",
        opt_photo: "Ֆոտո",
        opt_pdf: "PDF",
        opt_link: "AmperID Հղում",
        click_full_view: "Սեղմեք լիաէկրան դիտման համար",
        min: "րոպե",
        hour: "ժամ"
    },
    ru: {
        search_placeholder: "Поиск документов...",
        tab_all: "Все документы",
        tab_folders: "Папки",
        nav_path_root: "Папки",
        ctx_move: "Добавить в папку",
        ctx_delete: "Удалить",
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
        share_doc: "Отправить AmperID документ",
        share_qr_desc: "Покажите этот QR-код или отправьте ссылку:",
        security_num_label: "Код безопасности",
        security_num_desc: "Попросите получателя выбрать это число из вариантов на странице документа.",
        delete: "Удалить",
        delete_options: "Варианты удаления",
        delete_description: "Как вы хотите поступить с этим документом?",
        rm_from_folder: "Удалить только из папки",
        delete_completely: "Удалить полностью",
        ai_suggest: "Предложение ԱԲ",
        ai_suggest_desc: "ИИ считает, что лучшее место для этого документа:",
        ai_suggest_confirm: "Хотите переместить его туда?",
        yes_move: "Да, переместить",
        no_stay: "Нет, оставить здесь",
        ai_search_placeholder: "Спросите ИИ о ваших документах...",
        ai_assistant: "ИИ Помощник",
        ai_thinking: "ИИ думает...",
        ai_no_match: "Совпадений не найдено.",
        lock_screen_title: "Введите PIN-код",
        unlock_btn: "Открыть",
        security_title: "Безопасность",
        security_info: "Установите 4-значный PIN-код для защиты ваших документов от посторонних.",
        set_pin: "Установить PIN-код",
        remove_pin: "Удалить PIN-код",
        enable_bio: "Включить биометрию",
        pin_success: "PIN-код успешно установлен",
        pin_mismatch: "Неверный PIN-код",
        pin_removed: "PIN-код удален",
        generating_link: "Генерация ссылки...",
        error_creating_link: "Ошибка при создании ссылки.",
        reset_all_data: "Сбросить все данные",
        processing_pages: "Отправка {n} стр...",
        ai_processing: "ИИ сканирует... (ждать 10-20с)",
        dark_mode_label: "Тёмная тема",
        lock_app_btn: "Заблокировать",
        saving_db: "Сохранение в базу...",
        confirm_reset: "Предупреждение: Это удалит ВСЕ документы и папки. Продолжить?",
        confirm_delete_doc: "Удалить документ \"{t}\"?",
        confirm_delete_folder: "Удалить папку \"{t}\"?",
        new_folder_placeholder: "Новая папка",
        empty_view: "Папок пока нет",
        empty_folder: "Папка пуста",
        empty_all: "Нет документов",
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
        flag: "🇷🇺",
        share: "Поделиться",
        download: "Скачать",
        share_options: "Поделиться...",
        download_options: "Скачать как...",
        opt_photo: "Фото",
        opt_pdf: "PDF Документ",
        opt_link: "Ссылка AmperID",
        click_full_view: "Нажмите для полноэкранного просмотра",
        min: "мин",
        hour: "час"
    },
    en: {
        search_placeholder: "Search documents...",
        tab_all: "All Documents",
        tab_folders: "Folders",
        nav_path_root: "Folders",
        ctx_move: "Add to folder",
        ctx_delete: "Delete",
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
        share_pdf: "Share PDF",
        share_doc: "Share AmperID Document",
        share_qr_desc: "Show this QR code or send the link:",
        security_num_label: "Security Number",
        security_num_desc: "Ask the recipient to select this number from the options on the document page.",
        delete: "Delete",
        delete_options: "Delete Options",
        delete_description: "How would you like to handle this document?",
        rm_from_folder: "Remove from folder only",
        delete_completely: "Delete completely",
        generating_link: "Generating link...",
        error_creating_link: "Error creating link.",
        ai_suggest: "AI Suggestion",
        ai_suggest_desc: "AI thinks the best place for this is:",
        ai_suggest_confirm: "Would you like to move it there now?",
        yes_move: "Yes, move it",
        no_stay: "No, stay here",
        ai_search_placeholder: "Ask AI about your documents...",
        ai_assistant: "AI Assistant",
        ai_thinking: "AI is thinking...",
        ai_no_match: "No matching documents found.",
        lock_screen_title: "Enter PIN Code",
        unlock_btn: "Unlock",
        security_title: "Security",
        security_info: "Set a 4-digit PIN to protect your personal documents from unauthorized access.",
        set_pin: "Set PIN Code",
        remove_pin: "Remove PIN Code",
        enable_bio: "Enable Biometrics",
        pin_success: "PIN Code set successfully",
        pin_mismatch: "Wrong PIN Code",
        pin_removed: "PIN Code removed",
        reset_all_data: "Reset All Data",
        processing_pages: "Uploading {n} pages...",
        ai_processing: "AI scanning... (wait 10-20s)",
        dark_mode_label: "Dark Mode",
        lock_app_btn: "Lock Application",
        saving_db: "Saving to database...",
        confirm_reset: "Warning: This will delete ALL documents and folders. Continue?",
        confirm_delete_doc: "Delete document \"{t}\"?",
        confirm_delete_folder: "Delete folder \"{t}\"?",
        new_folder_placeholder: "New Folder",
        empty_view: "No folders yet",
        empty_folder: "Folder is empty",
        empty_all: "No documents",
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
        flag: "🇺🇸",
        share: "Share",
        download: "Download",
        share_options: "Share via...",
        download_options: "Download as...",
        opt_photo: "Photo",
        opt_pdf: "PDF Document",
        opt_link: "AmperID Link",
        click_full_view: "Click for full screen view",
        min: "min",
        hour: "hour"
    }
};

let currentLang = localStorage.getItem('amp_lang') || 'hy';
let currentTheme = localStorage.getItem('amp_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

function initTheme() {
    const body = document.body;
    const themeCheckbox = document.getElementById('checkbox');
    
    if (currentTheme === 'dark') {
        body.classList.remove('light-theme');
        body.classList.add('dark-theme');
        if (themeCheckbox) themeCheckbox.checked = true;
    } else {
        body.classList.remove('dark-theme');
        body.classList.add('light-theme');
        if (themeCheckbox) themeCheckbox.checked = false;
    }

    if (themeCheckbox) {
        themeCheckbox.onchange = toggleTheme;
    }
}

function toggleTheme() {
    const body = document.body;
    const themeCheckbox = document.getElementById('checkbox');
    
    if (themeCheckbox.checked) {
        body.classList.remove('light-theme');
        body.classList.add('dark-theme');
        currentTheme = 'dark';
    } else {
        body.classList.remove('dark-theme');
        body.classList.add('light-theme');
        currentTheme = 'light';
    }
    localStorage.setItem('amp_theme', currentTheme);
}

// --- Security / PIN Logic ---
let tempPin = "";
const getSavedPin = () => localStorage.getItem('amp_pin');

function initSecurity() {
    const pin = getSavedPin();
    const lockScreen = document.getElementById('lock-screen');
    const appContainer = document.getElementById('app');
    
    if (pin && pin.length === 4) {
        lockScreen.classList.remove('hidden');
        if (appContainer) appContainer.classList.add('app-hidden');
        tempPin = "";
        updatePinDots();
        
        // Try biometrics if HTTPS
        if (window.isSecureContext && localStorage.getItem('amp_bio_enabled') === 'true') {
            tryBiometrics();
        }
    } else {
        lockScreen.classList.add('hidden');
        if (appContainer) appContainer.classList.remove('app-hidden');
    }
    
    updateSecuritySettingsUI();
    
    // Toggle manual lock button visibility in header
    const manualBtn = document.getElementById('manual-lock-btn');
    if (manualBtn) {
        if (pin && pin.length === 4) {
            manualBtn.classList.remove('hidden');
            manualBtn.onclick = () => {
                userMenuModal.classList.add('hidden');
                document.getElementById('lock-screen').classList.remove('hidden');
                document.getElementById('app').classList.add('app-hidden');
                tempPin = "";
                updatePinDots();
            };
        }
        else manualBtn.classList.add('hidden');
    }
}

function updatePinDots() {
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach((dot, i) => {
        if (i < tempPin.length) dot.classList.add('filled');
        else dot.classList.remove('filled');
        dot.classList.remove('error');
    });
}

async function handlePinKey(val) {
    if (val === 'delete') {
        tempPin = tempPin.slice(0, -1);
    } else if (tempPin.length < 4) {
        tempPin += val;
    }
    
    updatePinDots();
    
    if (tempPin.length === 4) {
        const saved = getSavedPin();
        if (tempPin === saved) {
            // Success!
            document.getElementById('lock-screen').classList.add('hidden');
            const appContainer = document.getElementById('app');
            if (appContainer) appContainer.classList.remove('app-hidden');
            tempPin = "";
        } else {
            // Error shake
            const dots = document.querySelectorAll('.pin-dot');
            dots.forEach(dot => dot.classList.add('error'));
            setTimeout(() => {
                tempPin = "";
                updatePinDots();
            }, 500);
        }
    }
}

function updateSecuritySettingsUI() {
    const pin = getSavedPin();
    const setBtn = document.getElementById('set-pin-btn');
    const removeBtn = document.getElementById('remove-pin-btn');
    const bioBtn = document.getElementById('biometric-btn');
    const info = document.getElementById('security-info');
    const title = document.getElementById('security-title');

    title.innerText = t('security_title');
    info.innerText = t('security_info');
    
    if (pin) {
        setBtn.innerText = t('set_pin') + " (Update)";
        removeBtn.innerText = t('remove_pin');
        removeBtn.classList.remove('hidden');
        
        if (window.isSecureContext) {
            bioBtn.classList.remove('hidden');
            const isBio = localStorage.getItem('amp_bio_enabled') === 'true';
            bioBtn.innerText = isBio ? "🧬 Biometrics: ON" : "🧬 Biometrics: OFF";
        }
    } else {
        setBtn.innerText = t('set_pin');
        removeBtn.classList.add('hidden');
        bioBtn.classList.add('hidden');
    }
}

async function tryBiometrics() {
    // Simple WebAuthn / Biometric check for HTTPS
    if (!window.isSecureContext) return;
    // Note: Full WebAuthn implementation requires a back-end challenge 
    // For this demo, we'll use it as a 'unlock' trigger if supported
    console.log("Biometrics requested...");
}

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

/**
 * Recursive search helper for document fields
 */
function searchInDocData(data, term) {
    if (!data) return false;
    if (typeof data === 'string' || typeof data === 'number') {
        return String(data).toLowerCase().includes(term);
    }
    if (Array.isArray(data)) {
        return data.some(item => searchInDocData(item, term));
    }
    if (typeof data === 'object' && data !== null) {
        return Object.values(data).some(val => searchInDocData(val, term));
    }
    return false;
}

/**
 * Calculates the expiry status based on a given date string
 * Returns 'ok', 'warning' (1 week), 'urgent' (1 day), or 'expired'
 */
function getExpiryStatus(expiryDateStr) {
    if (!expiryDateStr) return 'ok';
    try {
        const expiry = new Date(expiryDateStr);
        if (isNaN(expiry.getTime())) return 'ok';
        
        const now = new Date();
        now.setHours(0,0,0,0);
        expiry.setHours(0,0,0,0);

        const diffTime = expiry - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return 'expired';
        if (diffDays <= 1) return 'urgent';
        if (diffDays <= 7) return 'warning';
        return 'ok';
    } catch(e) {
        return 'ok';
    }
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
    updateStaticTranslations();
    renderDocuments();
}

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
            renderDocuments();
        }
    };

    // AI Copy Button
    const aiCopyBtn = document.getElementById('ai-copy-btn');
    if (aiCopyBtn) {
        aiCopyBtn.onclick = () => {
            const textToCopy = aiResponseText.innerText;
            if (textToCopy && textToCopy !== '...') {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    const originalText = aiCopyBtn.innerText;
                    aiCopyBtn.innerText = '✅';
                    setTimeout(() => aiCopyBtn.innerText = originalText, 2000);
                });
            }
        };
    }
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
    if (!isAiSearchMode) {
        aiRelevantIds = null;
        renderDocuments();
    }
};

searchInput.onkeydown = async (e) => {
    if (e.key === 'Enter' && isAiSearchMode && searchTerm) {
        await executeAiSearch();
    }
};

const aiToggleBtn = document.getElementById('ai-search-toggle');
const aiResponseContainer = document.getElementById('ai-response-container');
const aiResponseText = document.getElementById('ai-response-text');

aiToggleBtn.onclick = () => {
    isAiSearchMode = !isAiSearchMode;
    aiToggleBtn.classList.toggle('active', isAiSearchMode);
    document.querySelector('.search-container').classList.toggle('ai-active', isAiSearchMode);
    
    if (isAiSearchMode) {
        searchInput.placeholder = t('ai_search_placeholder');
        aiRelevantIds = null;
    } else {
        searchInput.placeholder = t('search_placeholder');
        aiRelevantIds = null;
        aiResponseContainer.classList.add('hidden');
    }
    renderDocuments();
};

async function executeAiSearch() {
    if (!searchTerm) return;
    
    aiResponseContainer.classList.remove('hidden');
    aiResponseText.innerText = t('ai_thinking');
    aiResponseText.classList.add('loading');
    
    try {
        const allDocs = await db.documents.toArray();
        let docsToAnalyze = allDocs;
        
        // Scope to current folder if one is open
        if (currentFolderId !== null) {
            docsToAnalyze = allDocs.filter(d => String(d.folder_id) === String(currentFolderId));
        }

        const compactDocs = docsToAnalyze.map(d => ({
            id: d.id,
            title: d.title,
            fields: d.fields_json ? d.fields_json[currentLang]?.data || {} : {}
        }));

        console.log("DEBUG: Sending AI Search request...", {prompt: searchTerm, docCount: compactDocs.length});
        const response = await fetch('/api/process/ai-search/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: searchTerm,
                documents: compactDocs,
                lang: currentLang
            })
        });

        const result = await response.json();
        
        // Use Marked.js to parse the response if it exists, fallback to text
        const rawAnswer = result.answer || t('ai_no_match');
        if (typeof marked !== 'undefined' && marked.parse) {
            aiResponseText.innerHTML = marked.parse(rawAnswer);
        } else {
            aiResponseText.innerText = rawAnswer;
        }
        
        aiResponseText.classList.remove('loading');
        aiRelevantIds = result.relevant_ids || [];
        renderDocuments();
        
    } catch (err) {
        aiResponseText.innerText = "Error: " + err.message;
        aiResponseText.classList.remove('loading');
    }
}

// --- Modals & User Menu ---
logoTrigger.onclick = (e) => {
    e.stopPropagation();
    userMenuModal.classList.toggle('hidden');
};
document.getElementById('close-user-menu').onclick = () => userMenuModal.classList.add('hidden');

// Open Profile & Show generated info
document.getElementById('show-profile-btn').onclick = async (e) => {
    e.stopPropagation();
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

// Close modals when clicking outside (on the background overlay)
window.onclick = (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.classList.add('hidden');
    }
};

// Privacy Policy Modal Logic
const privacyModal = document.getElementById('privacy-modal');
const privacyTextContent = document.getElementById('privacy-text-content');

document.getElementById('show-privacy-btn').onclick = (e) => {
    e.stopPropagation();
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
    
    ctxShareBtn.onclick = () => {
        ctxMenuModal.classList.add('hidden');
        openShareModal(doc.id);
    };

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

let renderTimer;
let isRendering = false;

function formatDateShort(isoString) {
    if (!isoString) return "";
    const d = new Date(isoString);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hh}:${mm}`;
}

async function renderDocuments() {
    // Debounce: Cancel any pending render and start a new one to prevent duplication
    clearTimeout(renderTimer);
    renderTimer = setTimeout(async () => {
        if (isRendering || !docList) return;
        isRendering = true;
        try {
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
                
                if (isAiSearchMode && aiRelevantIds !== null) {
                    // Filter by AI suggested IDs (normalize types to Number)
                    const normalizedIds = aiRelevantIds.map(Number);
                    docs = docs.filter(d => normalizedIds.includes(Number(d.id)));
                } else if (searchTerm) {
                    // IF SEARCHING: Apply scope based on current folder
                    if (currentFolderId !== null) {
                        docs = docs.filter(d => String(d.folder_id) === String(currentFolderId));
                    }

                    const term = searchTerm.toLowerCase();
                    docs = docs.filter(d => {
                        // 1. Search in current language title
                        const currentTitle = getDocTitle(d, currentLang).toLowerCase();
                        if (currentTitle.includes(term)) return true;
                        
                        // 2. Deep search in all translations and fields
                        if (d.fields_json) {
                            return Object.values(d.fields_json).some(langData => {
                                if (!langData || typeof langData !== 'object') return false;
                                // Search title of this translation
                                if (langData.title && langData.title.toLowerCase().includes(term)) return true;
                                // Recursive search in data (fields)
                                return searchInDocData(langData.data, term);
                            });
                        }
                        
                        // 3. Fallback to base title
                        return d.title.toLowerCase().includes(term);
                    });
                }
                
                if (docs.length === 0) {
                    docList.innerHTML = `<p style="text-align:center; grid-column:1/-1; color:gray; margin-top:2rem;">${t('empty_all')}</p>`;
                } else {
                    docs.sort((a,b) => b.id - a.id).forEach(d => renderDocCard(d));
                }
            }
        } finally {
            isRendering = false;
        }
    }, 30); // 30ms is enough to batch multiple calls without visible delay
}

async function renderFolderCard(folder) {
    const card = document.createElement('div');
    card.className = 'folder-card';
    const isNew = folder.id === newlyCreatedFolderId;
    const dateStr = formatDateShort(folder.created_at);
    
    // Set all HTML at ONCE to avoid destroying listeners later
    card.innerHTML = `
        <div class="folder-icon">📁</div>
        ${isNew ? `<input type="text" value="${folder.name}" class="folder-title-input">` : `<div class="folder-name">${folder.name}</div>`}
        <div class="card-date">${dateStr}</div>
    `;
    
    if (isNew) {
        const input = card.querySelector('input');
        setTimeout(() => { if (input) { input.focus(); input.select(); } }, 50);
        let isSaving = false;
        const save = async () => {
            if (isSaving) return;
            isSaving = true;
            const val = input.value.trim() || t('no_name');
            await db.folders.update(folder.id, { name: val });
            newlyCreatedFolderId = null;
            renderDocuments();
        };
        input.onblur = save;
        input.onkeydown = (e) => { 
            if (e.key === 'Enter') { 
                e.preventDefault(); 
                input.onblur = null;
                save(); 
            } 
        };
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
    const displayTitle = getDocTitle(doc);
    const dateStr = formatDateShort(doc.created_at);
    
    // AI Expiry Dot
    let statusDot = '';
    const expiryDate = doc.fields_json?.expiry_date;
    if (expiryDate) {
        const status = getExpiryStatus(expiryDate);
        if (status !== 'ok') {
            statusDot = `<div class="status-dot ${status}"></div>`;
        }
    }

    div.innerHTML = `${statusDot}${thumb}<h3>${displayTitle}</h3><div class="card-date">${dateStr}</div>`;
    
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
    
    // AI Expiry Banner
    const expiryDate = fieldsRaw.expiry_date;
    if (expiryDate) {
        const status = getExpiryStatus(expiryDate);
        if (status !== 'ok') {
            const alerts = fieldsRaw.expiry_alerts?.[currentLang] || fieldsRaw.expiry_alerts?.['en'] || {};
            const alertMsg = alerts[status] || "";
            if (alertMsg) {
                detailFields.innerHTML = `<div class="expiry-banner ${status}">${alertMsg}</div>`;
            }
        }
    }

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

    // Copy Data Button logic
    const copyDataBtn = document.getElementById('copy-doc-data');
    if (copyDataBtn) {
        copyDataBtn.onclick = () => {
            let copyStr = `${document.getElementById('edit-doc-title').value.trim()}\n\n`;
            // Grab LIVE values from inputs in case user edited them
            document.querySelectorAll('.edit-field-val').forEach(input => {
                const key = input.dataset.key;
                const val = input.value.trim();
                copyStr += `${key}: ${val}\n`;
            });

            copyToClipboard(copyStr).then(() => {
                const originalText = copyDataBtn.innerText;
                copyDataBtn.innerText = '✅ ' + t('copy_data');
                setTimeout(() => copyDataBtn.innerText = originalText, 2000);
            }).catch(err => {
                console.error("Copy failed", err);
                alert("Copy failed. Please try manual copy.");
            });
        };
    }

    // Add Field Box Logic
    const addFieldBox = document.getElementById('add-field-box');
    const showAddFieldBtn = document.getElementById('show-add-field');
    const saveNewFieldBtn = document.getElementById('save-new-field');
    const cancelNewFieldBtn = document.getElementById('cancel-new-field');

    if (showAddFieldBtn) {
        showAddFieldBtn.onclick = () => {
            addFieldBox.classList.toggle('hidden');
        };
    }

    if (cancelNewFieldBtn) {
        cancelNewFieldBtn.onclick = () => {
            addFieldBox.classList.add('hidden');
            document.getElementById('new-field-key').value = '';
            document.getElementById('new-field-val').value = '';
        };
    }

    if (saveNewFieldBtn) {
        saveNewFieldBtn.onclick = async () => {
            const key = document.getElementById('new-field-key').value.trim();
            const val = document.getElementById('new-field-val').value.trim();
            if (!key || !val) {
                alert("Please fill both fields");
                return;
            }

            const updatedFields = doc.fields_json || {};
            // Append to current language data
            if (updatedFields[currentLang]) {
                updatedFields[currentLang].data[key] = val;
            } else if (updatedFields.տվյալներ) {
                // Legacy support
                updatedFields.տվյալներ[key] = val;
            } else {
                // Fresh start or flat object
                if (!updatedFields[currentLang]) updatedFields[currentLang] = { title: displayTitle, data: {} };
                updatedFields[currentLang].data[key] = val;
            }

            await db.documents.update(id, { fields_json: updatedFields });
            document.getElementById('new-field-key').value = '';
            document.getElementById('new-field-val').value = '';
            addFieldBox.classList.add('hidden');
            
            // Reload the detail view to show new field
            openDetail(id);
        };
    }

    // New Choice Modal Triggers
    openShareChoiceBtn.onclick = () => openShareChoice(id);
    openDownloadChoiceBtn.onclick = () => openDownloadChoice(id);
    
    // Image Click -> Full Screen
    detailImage.onclick = () => openImageViewer(doc.thumbnail_data);
    
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

const themeCheckbox = document.getElementById('checkbox');
if (themeCheckbox) {
    themeCheckbox.onchange = toggleTheme;
}

// Lock Screen Keypad
document.querySelectorAll('.pin-key[data-val]').forEach(key => {
    key.onclick = () => handlePinKey(key.dataset.val);
});
document.getElementById('pin-delete').onclick = () => handlePinKey('delete');
document.getElementById('pin-bio-trigger').onclick = () => tryBiometrics();

// Security Settings
document.getElementById('set-pin-btn').onclick = () => {
    const newPin = prompt("Enter new 4-digit PIN:");
    if (newPin && /^\d{4}$/.test(newPin)) {
        localStorage.setItem('amp_pin', newPin);
        alert(t('pin_success'));
        updateSecuritySettingsUI();
        initSecurity(); // Immediately lock if needed, though usually they are already in the app
    } else if (newPin !== null) {
        alert("Invalid PIN. Please enter exactly 4 digits.");
    }
};

document.getElementById('remove-pin-btn').onclick = () => {
    if (confirm("Remove PIN protection? Your data will be accessible to anyone with your device.")) {
        localStorage.removeItem('amp_pin');
        localStorage.removeItem('amp_bio_enabled');
        updateSecuritySettingsUI();
        initSecurity();
    }
};

document.getElementById('biometric-btn').onclick = () => {
    const isBio = localStorage.getItem('amp_bio_enabled') === 'true';
    localStorage.setItem('amp_bio_enabled', (!isBio).toString());
    updateSecuritySettingsUI();
};

const manualLockBtn = document.getElementById('manual-lock-btn');
if (manualLockBtn) {
    manualLockBtn.onclick = () => {
        // Just re-run security init to trigger the lock screen
        initSecurity();
    };
}

const resetAll = async () => {
    if (confirm("Are you SURE? This will permanently delete ALL your documents and settings from this device.")) {
        await db.delete();
        localStorage.clear();
        location.reload();
    }
};

document.getElementById('reset-all-btn').onclick = resetAll;
const resetMenuBtn = document.getElementById('reset-all-data-btn');
if (resetMenuBtn) resetMenuBtn.onclick = resetAll;

// --- PWA Cleanup: Unregister any existing service workers ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
            registration.unregister();
            console.log('Old Service Worker unregistered');
        }
    });
}

// --- Timed Sharing Logic ---
let currentSharingDocId = null;

function openShareModal(docId) {
    currentSharingDocId = docId;
    document.getElementById('share-step-time').classList.remove('hidden');
    document.getElementById('share-step-result').classList.add('hidden');
    document.getElementById('share-modal').classList.remove('hidden');
    document.getElementById('share-qrcode').innerHTML = '';
}

function closeShareModal() {
    document.getElementById('share-modal').classList.add('hidden');
    currentSharingDocId = null;
}

async function shareDocument(docId, minutes) {
    const btnBox = document.querySelector('#share-step-time .vertical-actions');
    const originalContent = btnBox.innerHTML;
    btnBox.innerHTML = `<div class="loader-small"></div><p style="text-align:center;">${t('generating_link')}</p>`;

    try {
        const doc = await db.documents.get(docId);
        if (!doc) return;

        const response = await fetch('/api/share/create', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                minutes: minutes,
                title: doc.title,
                image: doc.thumbnail_data, 
                fields: doc.fields_json ? doc.fields_json[currentLang]?.data || {} : {}
            })
        });

        if (response.ok) {
            const data = await response.json();
            showShareResult(data);
        } else {
            alert(t('error_creating_link'));
            btnBox.innerHTML = originalContent;
            initShareModalListeners();
        }
    } catch (err) {
        console.error("Share failed:", err);
        btnBox.innerHTML = originalContent;
        initShareModalListeners();
    }
}

function initShareModalListeners() {
    const timeBtns = document.querySelectorAll('.time-btn');
    timeBtns.forEach(btn => {
        btn.onclick = () => {
            const mins = btn.getAttribute('data-time');
            if (currentSharingDocId) shareDocument(currentSharingDocId, mins);
        };
    });

    const closeBtn = document.getElementById('close-share-btn');
    if (closeBtn) closeBtn.onclick = closeShareModal;
    
    const cancelBtn = document.getElementById('cancel-share-btn');
    if (cancelBtn) cancelBtn.onclick = closeShareModal;
}

function showShareResult(data) {
    document.getElementById('share-step-time').classList.add('hidden');
    document.getElementById('share-step-result').classList.remove('hidden');
    
    const shareUrl = `${window.location.origin}/share/${data.share_id}`;
    document.getElementById('share-url').value = shareUrl;
    document.getElementById('share-security-num').innerText = data.security_number;

    const qrContainer = document.getElementById('share-qrcode');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: shareUrl,
        width: 160,
        height: 160,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });
}

function copyShareUrl() {
    const urlInput = document.getElementById('share-url');
    urlInput.select();
    navigator.clipboard.writeText(urlInput.value);
    const copyBtn = document.getElementById('copy-share-url-btn');
    const original = copyBtn.innerText;
    copyBtn.innerText = '✅';
    setTimeout(() => copyBtn.innerText = original || '🔗', 2000);
}

// AI Response Copy logic
const aiCopyBtn = document.getElementById('ai-copy-btn');
if (aiCopyBtn) {
    aiCopyBtn.onclick = () => {
        const textToCopy = document.getElementById('ai-response-text').innerText;
        copyToClipboard(textToCopy).then(() => {
            const original = aiCopyBtn.innerText;
            aiCopyBtn.innerText = '✅';
            setTimeout(() => aiCopyBtn.innerText = original, 2000);
        });
    };
}

function updateStaticTranslations() {
    const tKeys = translations[currentLang];
    
    // 1. Universal data-t translation loop
    document.querySelectorAll('[data-t]').forEach(el => {
        const key = el.getAttribute('data-t');
        const translatedContent = t(key);
        
        if (translatedContent && translatedContent !== key) {
            if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
                el.placeholder = translatedContent;
            } else {
                el.innerText = translatedContent;
            }
        }
    });

    const loaderStatus = document.getElementById('loader-status');
    if (loaderStatus) loaderStatus.innerText = t('loader_default');
    
    const flagEl = document.getElementById('current-lang-flag');
    if (flagEl) flagEl.innerText = tKeys.flag;
}

// --- New Feature Handlers (Share, Download, View) ---

function openShareChoice(id) {
    currentDetailDocId = id;
    const modal = document.getElementById('share-choice-modal');
    if (modal) modal.classList.remove('hidden');
}

function openDownloadChoice(id) {
    currentDetailDocId = id;
    const modal = document.getElementById('download-choice-modal');
    if (modal) modal.classList.remove('hidden');
}

function openImageViewer(src) {
    if (!src) return;
    const viewer = document.getElementById('full-image-viewer');
    const img = document.getElementById('viewer-img');
    if (viewer && img) {
        img.src = src;
        viewer.classList.remove('hidden');
    }
}

async function invokeSharer(type) {
    const doc = await db.documents.get(currentDetailDocId);
    if (!doc) return;

    document.getElementById('share-choice-modal').classList.add('hidden');
    
    if (type === 'link') {
        openShareModal(doc.id);
        return;
    }

    try {
        const safeTitle = (doc.title || "document").replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const extension = type === 'pdf' ? 'pdf' : 'jpg';
        const mime = type === 'pdf' ? 'application/pdf' : 'image/jpeg';
        const dataUrl = type === 'pdf' ? doc.pdf_data : doc.thumbnail_data;
        
        if (!dataUrl) {
            alert("No data available to share");
            return;
        }

        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `${safeTitle}.${extension}`, { type: mime });

        // Check for Web Share API support
        if (navigator.share) {
            // Check if specifically file sharing is supported
            const canShareFiles = navigator.canShare && navigator.canShare({ files: [file] });
            
            if (canShareFiles) {
                await navigator.share({
                    files: [file],
                    title: doc.title || "AmperID Document",
                    text: `Shared document from AmperID`
                });
            } else {
                // If can't share files but can share text/url, try that or notify
                console.warn("File sharing not supported by this browser. Falling back to download.");
                alert("Native file sharing is not supported by your browser. Downloading the file instead.");
                invokeDownloader(type);
            }
        } else {
            console.warn("Web Share API not available. Falling back to download.");
            alert("Sharing is not available on this browser. Downloading the file instead.");
            invokeDownloader(type);
        }
    } catch (err) {
        console.error("Sharing failed", err);
        // If it's a PermissionDenied or similar, don't necessarily download unless intended
        if (err.name !== 'AbortError') {
            invokeDownloader(type);
        }
    }
}

async function invokeDownloader(type) {
    const doc = await db.documents.get(currentDetailDocId);
    if (!doc) return;

    document.getElementById('download-choice-modal').classList.add('hidden');
    const dataUrl = type === 'pdf' ? doc.pdf_data : doc.thumbnail_data;
    const extension = type === 'pdf' ? 'pdf' : 'jpg';

    if (!dataUrl) {
        alert("No data available to download");
        return;
    }

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${doc.title}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Final Initialization Consolidation
window.onload = () => {
    initTheme();
    initSecurity();
    initLangSwitcher();
    updateStaticTranslations();
    initTabs();
    initFolderNav();
    initContextUI();
    initShareModalListeners();
    renderDocuments();
};

// Global Event Listeners for Choice Modals
const closeShareChoice = document.getElementById('close-share-choice');
const cancelShareChoice = document.getElementById('cancel-share-choice');
if (closeShareChoice) closeShareChoice.onclick = () => document.getElementById('share-choice-modal').classList.add('hidden');
if (cancelShareChoice) cancelShareChoice.onclick = () => document.getElementById('share-choice-modal').classList.add('hidden');

const closeDownloadChoice = document.getElementById('close-download-choice');
const cancelDownloadChoice = document.getElementById('cancel-download-choice');
if (closeDownloadChoice) closeDownloadChoice.onclick = () => document.getElementById('download-choice-modal').classList.add('hidden');
if (cancelDownloadChoice) cancelDownloadChoice.onclick = () => document.getElementById('download-choice-modal').classList.add('hidden');

const closeViewer = document.getElementById('close-viewer');
if (closeViewer) closeViewer.onclick = () => document.getElementById('full-image-viewer').classList.add('hidden');

// Action Listeners
document.getElementById('share-opt-photo').onclick = () => invokeSharer('photo');
document.getElementById('share-opt-pdf').onclick = () => invokeSharer('pdf');
document.getElementById('share-opt-link').onclick = () => invokeSharer('link');

document.getElementById('download-opt-photo').onclick = () => invokeDownloader('photo');
document.getElementById('download-opt-pdf').onclick = () => invokeDownloader('pdf');

// Copy Share URL
const copyUrlBtn = document.getElementById('copy-share-url-btn');
if (copyUrlBtn) {
    copyUrlBtn.onclick = () => {
        const urlInput = document.getElementById('share-url');
        if (urlInput) {
            copyToClipboard(urlInput.value).then(() => {
                const original = copyUrlBtn.innerText;
                copyUrlBtn.innerText = '✅';
                setTimeout(() => copyUrlBtn.innerText = original || '🔗', 2000);
            });
        }
    };
}
