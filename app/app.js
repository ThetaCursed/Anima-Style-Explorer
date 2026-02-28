﻿document.addEventListener('DOMContentLoaded', () => {
    const DEBUG_MODE = false; // Установите true, чтобы включить проверку путей к изображениям

    const galleryContainer = document.getElementById('gallery-container');
    const loader = document.getElementById('loader');
    const tabGallery = document.getElementById('tab-gallery');
    const tabFavorites = document.getElementById('tab-favorites');
    const searchInput = document.getElementById('search-input');
    const sortByNameBtn = document.getElementById('sort-by-name');
    const sortByWorksBtn = document.getElementById('sort-by-works');
    const sortByUniquenessBtn = document.getElementById('sort-by-uniqueness');
    const scrollToTopBtn = document.getElementById('scroll-to-top');
    const gridSlider = document.getElementById('grid-slider');
    const gridSliderValue = document.getElementById('grid-slider-value');
    const controlsContainer = document.getElementById('controls-container');
    const swipeLaunchControls = document.querySelector('.swipe-launch-controls');
    const favoritesControlsWrapper = document.getElementById('favorites-controls-wrapper');
    const styleCounter = document.getElementById('style-counter');
    const txtExportContainer = document.getElementById('txt-export-container');
    const importFavoritesInput = document.getElementById('import-favorites-input');
    const swipeContinueHint = document.getElementById('swipe-continue-hint'); // Новый элемент
    const jumpInput = document.getElementById('jump-input');
    const clearJumpBtn = document.getElementById('clear-jump-btn'); // Эта кнопка теперь крестик
    const jumpControls = document.querySelector('.jump-controls');
    const searchWrapper = document.querySelector('.search-wrapper');
    const sortControls = document.querySelector('.sort-controls');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    let allItems = [];
    let itemsSortedByWorks = []; // Новый массив для быстрого поиска по работам
    let favorites = new Map(); // Используем Map для хранения {id: timestamp}
    let currentItems = [];
    let currentPage = 0;
    let startIndexOffset = 0; // Смещение для "перехода к номеру"
    const itemsPerPage = 20;
    let searchTerm = ''; // 'gallery', 'favorites'
    let currentView = 'gallery'; // 'gallery', 'favorites', or 'about'
    let sortType = 'name'; // 'name', 'works', or 'uniqueness'
    let sortDirection = 'desc'; // 'asc' or 'desc'
    let isLoading = false;
    let sortUpdateTimeout; // Переменная для таймера сохранения сортировки
    let previousSortType = null; // Для восстановления сортировки после "Jump"
    let previousSortDirection = null; // Для восстановления сортировки после "Jump"
    let jumpTimeout; // Таймер для отложенного перехода
    const SORT_TYPE_KEY = 'sortType';
    const SORT_DIRECTION_KEY = 'sortDirection';

    // --- Глобальные переменные для доступа из других скриптов ---
    window.appGlobals = {
        get currentItems() { return currentItems; },
        get favorites() { return favorites; },
        get searchTerm() { return searchTerm; },
        get currentView() { return currentView; },
        get db() { return db; },
        get STORE_NAME() { return STORE_NAME; },
        toggleFavorite,
        showToast,
        renderView,
        updateVisibleFavorites // Экспортируем новую функцию
    };

    // --- Определение базового пути для изображений ---
    // Проверяем, запущено ли приложение с веб-сервера (http/https) или локально (file:)
    const isOnline = window.location.protocol.startsWith('http');
    const imageBasePath = isOnline 
        ? 'https://cdn.statically.io/gh/ThetaCursed/Anima-Style-Explorer/main/' 
        : '';




    // --- Функции создания элементов ---

    // --- IndexedDB ---
    let db;
    const DB_NAME = 'StyleGalleryDB';
    const STORE_NAME = 'favorites';

    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 2); // Увеличиваем версию для обновления схемы

            request.onerror = () => {
                console.error('IndexedDB error:', request.error);
                reject('Error opening DB');
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Удаляем старое хранилище, если оно существует, чтобы избежать конфликтов
                if (db.objectStoreNames.contains(STORE_NAME)) {
                    db.deleteObjectStore(STORE_NAME);
                }
                // Создаем новое хранилище с id в качестве ключа и индексом по временной метке
                const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                objectStore.createIndex('timestamp', 'timestamp', { unique: false });
            };
        });
    }

    async function loadFavoritesFromDB() {
        return new Promise((resolve) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const objectStore = transaction.objectStore(STORE_NAME);
            const request = objectStore.getAll();
            request.onsuccess = () => {
                // Загружаем в Map в формате {id: timestamp}
                favorites = new Map(request.result.map(item => [item.id, item.timestamp]));
                resolve();
            };
        });
    }

    /**
     * Debug: Проверяет доступность всех изображений и выводит статистику в консоль.
     * Работает только если DEBUG_MODE = true.
     */
    async function debug_checkImagePaths() {
        if (!DEBUG_MODE) return;

        console.log('%c[DEBUG] Запущена проверка путей к изображениям...', 'color: orange; font-weight: bold;');

        const totalItems = allItems.length;
        let foundCount = 0;
        const notFoundArtists = [];

        const checkImage = (item) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    foundCount++;
                    resolve();
                };
                img.onerror = () => {
                    notFoundArtists.push({ artist: item.artist, id: item.id, path: item.image });
                    resolve();
                };
                img.src = item.image;
            });
        };

        // Выполняем все проверки параллельно
        await Promise.all(allItems.map(item => checkImage(item)));

        const notFoundCount = notFoundArtists.length;
        console.log('%c[DEBUG] Проверка изображений завершена.', 'color: orange; font-weight: bold;');
        console.log(`- Всего проверено: ${totalItems}`);
        console.log(`- Найдено изображений: %c${foundCount}`, 'color: green;');
        console.log(`- Не найдено изображений: %c${notFoundCount}`, `color: ${notFoundCount > 0 ? 'red' : 'green'};`);

        if (notFoundCount > 0) {
            console.warn('[DEBUG] Список художников с отсутствующими изображениями:');
            console.table(notFoundArtists);
        }
    }
    function createCard(item) {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.artist = item.artist;
        card.dataset.id = item.id;

        const isFavorited = favorites.has(item.id);
        
        // Если активна сортировка по уникальности, показываем ранг
        const rankHTML = sortType === 'uniqueness' && item.uniquenessRank
            ? `<div class="uniqueness-rank" title="Uniqueness Rank">#${item.uniquenessRank}</div>`
            : '';

        let favButtonHTML;
        if (currentView === 'favorites') {
            // В "Избранном" всегда показываем кнопку удаления (крестик)
            favButtonHTML = `
                <button 
                    class="favorite-button remove-favorite" 
                    aria-label="Remove from favorites"
                    title="Remove from favorites"
                >
                    ×
                </button>
            `;
        } else {
            // В "Галерее" показываем звездочку
            favButtonHTML = `
                <button 
                    class="favorite-button ${isFavorited ? 'favorited' : ''}" 
                    aria-label="${isFavorited ? 'Remove from favorites' : 'Add to favorites'}"
                    title="${isFavorited ? 'Remove from favorites' : 'Add to favorites'}"
                >
                    
                </button>
            `;
        }

        card.innerHTML = `
            <img class="card__image" src="${item.image}" alt="${item.artist}" loading="lazy" width="832" height="1216">
            <div class="card__info">
                <p class="card__artist">${item.artist}</p>
            </div>
            <div class="works-count" title="Approximate number of training images for this artistic style">
                ${item.worksCount.toLocaleString('en-US')}
            </div>
            ${rankHTML}
            ${favButtonHTML}
        `;

        // Копирование имени по клику на карточку (кроме кнопки "избранное")
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('favorite-button')) {
                navigator.clipboard.writeText(item.artist).then(() => {
                    showToast('Artist name copied to clipboard!');
                });
            }
        });

        // Обработка клика по кнопке "избранное"
        const favButton = card.querySelector('.favorite-button');
        favButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Предотвращаем копирование имени
            toggleFavorite(item, favButton);
        });

        return card;
    }

    // --- Функции управления данными и отображением ---

    async function loadInitialData() {
        try {
            // Данные теперь берутся из глобальной переменной galleryData из файла data.js
            if (typeof galleryData !== 'undefined' && allItems.length === 0) {
                // Преобразуем новый формат данных в старый, с которым работает приложение
                allItems = galleryData.map(item => ({
                    artist: item.name,
                    image: `${imageBasePath}images/${item.p}/${item.id}.webp`,
                    worksCount: item.post_count,
                    id: item.id,
                    uniqueness_score: item.uniqueness_score
                }));

                // Создаем заранее отсортированную копию для функции jump
                itemsSortedByWorks = [...allItems].sort((a, b) => b.worksCount - a.worksCount);
            }

            // Запускаем отладочную проверку изображений
            await debug_checkImagePaths();

            // Обновляем счетчик стилей
            styleCounter.innerHTML = `Artist-based styles: <span class="style-count-number">${allItems.length.toLocaleString('en-US')}</span>`;

            await loadFavoritesFromDB(); // Загружаем избранное из IndexedDB
            renderView();
        } catch (error) {
            console.error('Failed to load gallery data:', error);
            galleryContainer.innerHTML = '<p style="text-align: center; grid-column: 1 / -1;">Failed to load data.</p>';
        }
    }

    function renderView() {
        currentPage = 0;
        galleryContainer.innerHTML = '';
        // Обновляем UI контролов перед отрисовкой
        updateSortButtonsUI();

        // Добавляем или убираем класс для скрытия счетчика работ
        if (sortType === 'uniqueness') {
            galleryContainer.classList.add('uniqueness-view');
            jumpInput.placeholder = 'Jump to rank...';
        } else {
            galleryContainer.classList.remove('uniqueness-view');
            jumpInput.placeholder = 'Jump to work count...';
        }
        // Добавляем класс для вида "Избранное"
        galleryContainer.classList.toggle('favorites-view', currentView === 'favorites');

        // --- Логика "Продолжить просмотр" ---
        const jumpToArtistId = localStorage.getItem('jumpToArtistId');
        if (jumpToArtistId && currentView === 'gallery') {
            // Сначала применяем текущую сортировку, чтобы найти правильный индекс
            let tempSortedItems = [...allItems];
            const tempDirection = sortDirection === 'asc' ? 1 : -1;
            if (sortType === 'name') {
                tempSortedItems.sort((a, b) => a.artist.localeCompare(b.artist) * tempDirection);
            } else if (sortType === 'works') {
                tempSortedItems.sort((a, b) => (a.worksCount - b.worksCount) * tempDirection);
            } else if (sortType === 'uniqueness') {
                tempSortedItems.sort((a, b) => (b.uniqueness_score || 0) - (a.uniqueness_score || 0));
            }

            const targetIndex = tempSortedItems.findIndex(item => item.id === jumpToArtistId);

            if (targetIndex !== -1) {
                // Устанавливаем смещение, чтобы начать рендер с нужного места
                startIndexOffset = targetIndex;
            }
        }
        // --- Конец логики ---

        window.scrollTo({ top: 0, behavior: 'instant' }); // Мгновенная прокрутка вверх при ререндере
        
        // 1. Сортируем данные
        let sortedItems = [...allItems];
        const direction = sortDirection === 'asc' ? 1 : -1;

        if (sortType === 'name') {
            sortedItems.sort((a, b) => a.artist.localeCompare(b.artist) * direction);
        } else if (sortType === 'works') {
            // Для 'works', 'desc' - это b-a, 'asc' - это a-b.
            // direction = -1 для 'desc', поэтому (a-b) * -1 = b-a.
            sortedItems.sort((a, b) => (a.worksCount - b.worksCount) * direction);
        } else if (sortType === 'uniqueness') {
            // Для 'uniqueness' направление всегда 'desc'
            sortedItems.sort((a, b) => (b.uniqueness_score || 0) - (a.uniqueness_score || 0));
        }
        
        // Добавляем ранг после основной сортировки, но до других фильтров
        sortedItems.forEach((item, index) => {
            if (sortType === 'uniqueness') {
                item.uniquenessRank = index + 1;
            } else {
                // Удаляем ранг, если он не нужен, чтобы он не отображался в других видах
                delete item.uniquenessRank;
            }
        });

        // 2. Фильтруем по избранному, если нужно (до поиска, чтобы поиск работал по избранным)
        if (currentView === 'favorites') {
            sortedItems = sortedItems.filter(item => favorites.has(item.id));
            // Сортируем избранное по временной метке (новые сверху)
            sortedItems.sort((a, b) => favorites.get(b.id) - favorites.get(a.id));
        }

        // 3. Фильтруем по строке поиска
        let filteredItems;
        if (searchTerm) {
            filteredItems = sortedItems.filter(item => 
                item.artist.toLowerCase().includes(searchTerm)
            );
        } else {
            filteredItems = sortedItems;
        }

        // 4. Применяем смещение для "перехода к номеру" (только для галереи)
        // Итоговый массив для отображения
        currentItems = filteredItems.slice(startIndexOffset);

        // Проверяем, есть ли результаты ПОСЛЕ всех фильтраций
        if (filteredItems.length === 0) {
            const p = document.createElement('p');
            p.style.textAlign = 'center';
            p.style.gridColumn = '1 / -1';

            if (currentView === 'favorites') {
                if (favorites.size > 0 && searchTerm) {
                    p.innerText = `No artists found for "${searchTerm}" in your favorites.`;
                } else {
                    p.innerText = 'You have no favorites yet.';
                }
            } else if (searchTerm) { // Только для вида "Gallery" с активным поиском
                p.innerText = `No artists found for "${searchTerm}".`;
            } else {
                // Для пустой галереи без поиска (маловероятно, но на всякий случай)
                p.innerText = 'No artists found.';
            }
            galleryContainer.appendChild(p);
            return;
        }
        
        loadMoreItems();
    }

    function loadMoreItems() {
        if (isLoading) return;
        isLoading = true;
        loader.style.display = 'block';

        // Имитация задержки сети для демонстрации загрузчика
        setTimeout(() => {
            const start = currentPage * itemsPerPage;
            const end = start + itemsPerPage;
            const itemsToLoad = currentItems.slice(start, end);

            itemsToLoad.forEach(item => {
                const card = createCard(item);
                galleryContainer.appendChild(card);
            });

            currentPage++;
            isLoading = false;
            loader.style.display = 'none';

            // Если больше нечего загружать, скрываем лоадер навсегда для этой сессии
            if (currentPage * itemsPerPage >= currentItems.length) {
                loader.style.display = 'none';
            } else {
                // Проверяем, нужно ли загрузить еще, если контент не заполняет экран
                checkAndLoadMoreIfContentDoesNotFillScreen();
            }

            // --- Логика "Продолжить просмотр" ---
            // Очищаем флаг после того, как смещение было использовано в renderView
            const jumpToArtistId = localStorage.getItem('jumpToArtistId');
            if (jumpToArtistId) {
                localStorage.removeItem('jumpToArtistId');
            }

        }, 500);
    }

    // --- Функции-помощники ---

    function checkAndLoadMoreIfContentDoesNotFillScreen() {
        const hasScrollbar = document.body.scrollHeight > window.innerHeight;
        const hasMoreItems = currentPage * itemsPerPage < currentItems.length;
        if (!isLoading && !hasScrollbar && hasMoreItems) {
            loadMoreItems();
        }
    }

    function toggleFavorite(item, button) {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        if (favorites.has(item.id)) {
            // Удалить из избранного
            store.delete(item.id);
            favorites.delete(item.id);
            showToast('Removed from favorites');
            if (currentView === 'gallery') {
                // button.textContent = '♡'; // Теперь управляется через CSS
                button.title = 'Add to favorites';
                button.setAttribute('aria-label', 'Add to favorites');
                button.classList.remove('favorited');
            }
        } else {
            // Добавить в избранное
            const favItem = { id: item.id, timestamp: Date.now() };
            store.put(favItem);
            favorites.set(item.id, favItem.timestamp);
            showToast('Added to favorites');
            // В галерее меняем иконку на звезду
            // button.textContent = '♥'; // Теперь управляется через CSS
            button.title = 'Remove from favorites';
            button.setAttribute('aria-label', 'Remove from favorites');
            button.classList.add('favorited');
        }

        // Если мы в избранном, нужно сразу обновить вид
        if (currentView === 'favorites') {
            // Вместо полного перерендера, просто удаляем карточку из DOM
            const card = button.closest('.card');
            if (card) {
                // Анимация исчезновения и схлопывания
                card.style.transition = 'opacity 0.15s ease, transform 0.15s ease, margin 0.15s ease, padding 0.15s ease, max-height 0.15s ease';
                card.style.transform = 'scale(0.8)';
                card.style.opacity = '0';
                card.style.margin = '0';
                card.style.padding = '0';
                card.style.maxHeight = '0px';

                card.addEventListener('transitionend', () => {
                    card.remove();
                    // Если больше нет избранных, показываем сообщение
                    if (favorites.size === 0) {
                        galleryContainer.innerHTML = '<p style="text-align: center; grid-column: 1 / -1;">No favorites yet.</p>';
                    }
                    // Обновляем счетчик в реальном времени
                    styleCounter.innerHTML = `Styles in Favorites: <span class="style-count-number">${favorites.size.toLocaleString('en-US')}</span>`;
                }, { once: true }); // Событие сработает только один раз
            }
        }
        // Обновляем состояние сердечек на видимых карточках в галерее
        updateVisibleFavorites();
    }

    /**
     * Обновляет визуальное состояние кнопок "избранное" для всех видимых карточек в галерее.
     * Вызывается после изменений в избранном, сделанных в других модулях (например, Swipe Mode).
     */
    function updateVisibleFavorites() {
        if (currentView !== 'gallery') return;

        const cards = galleryContainer.querySelectorAll('.card');
        cards.forEach(card => {
            const cardId = card.dataset.id;
            const favButton = card.querySelector('.favorite-button');
            if (cardId && favButton && !favButton.classList.contains('remove-favorite')) {
                const isFavorited = favorites.has(cardId);
                favButton.classList.toggle('favorited', isFavorited);
                const newTitle = isFavorited ? 'Remove from favorites' : 'Add to favorites';
                favButton.title = newTitle;
                favButton.setAttribute('aria-label', newTitle);
            }
        });
    }

    function showToast(message) {
        const toast = document.getElementById('toast-notification');
        if (message) toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2000);
    }

    function setActiveTab(activeTab) {
        const tabs = [tabGallery, tabFavorites];
        tabs.forEach(tab => tab.classList.remove('active'));
        activeTab.classList.add('active');
    }

    /**
     * Централизованная функция для управления состоянием (включено/выключено) всех контролов.
     */
    function updateControlsState() {
        const isSearchingByName = searchInput.value.trim().length > 0;
        const isJumpingByCount = jumpInput.value.trim().length > 0;

        // Блокируем сортировку, если активен любой из поисков
        sortControls.classList.toggle('disabled', isSearchingByName || isJumpingByCount);
        // Блокируем "Jump", если идет поиск по имени
        jumpControls.classList.toggle('disabled', isSearchingByName);
        // Блокируем поиск по имени, если идет поиск по "Jump"
        searchInput.parentElement.classList.toggle('disabled', isJumpingByCount);
        // Блокируем Swipe Mode, если идет поиск по имени или "Jump"
        swipeLaunchControls.classList.toggle('disabled', isSearchingByName || isJumpingByCount);
    }

    // --- Обработчики событий ---

    // Появление/скрытие кнопки "Наверх"
    window.addEventListener('scroll', () => {
        // Появление/скрытие кнопки "Наверх"
        if (window.scrollY > 300) {
            scrollToTopBtn.classList.add('visible');
        } else {
            scrollToTopBtn.classList.remove('visible');
        }

        // Проверяем, достигли ли мы конца страницы
        if (!isLoading && (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) {
            if (currentPage * itemsPerPage < currentItems.length) {
                loadMoreItems();
            }
        }
    });

    // Клик по кнопке "Наверх"
    scrollToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' }); // Плавная прокрутка наверх
    });

    tabGallery.addEventListener('click', (e) => {
        e.preventDefault(); // Предотвращаем переход по ссылке
        if (currentView === 'gallery') return;
        setActiveTab(tabGallery);
        favoritesControlsWrapper.style.display = 'none'; // Скрываем кнопки импорта/экспорта
        txtExportContainer.style.display = 'none';
        swipeContinueHint.style.display = 'none'; // Скрываем подсказку
        jumpControls.style.display = 'flex';
        searchInput.parentElement.style.borderBottom = '1px solid var(--border-color)'; // Восстанавливаем разделитель
        swipeLaunchControls.style.display = 'flex';
        sortControls.style.display = 'flex';
        currentView = 'gallery';
        // Обновляем счетчик для отображения общего количества стилей
        styleCounter.innerHTML = `Artist-based styles: <span class="style-count-number">${allItems.length.toLocaleString('en-US')}</span>`;

        renderView();

        // Очищаем поиск при переключении на галерею
        if (searchInput.value) {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });

    tabFavorites.addEventListener('click', (e) => {
        e.preventDefault(); // Предотвращаем переход по ссылке
        if (currentView === 'favorites') return;
        setActiveTab(tabFavorites);
        favoritesControlsWrapper.style.display = 'flex'; // Показываем кнопки импорта/экспорта
        txtExportContainer.style.display = 'flex';
        swipeContinueHint.style.display = 'block'; // Показываем подсказку
        jumpControls.style.display = 'none';
        searchInput.parentElement.style.borderBottom = 'none'; // Убираем разделитель, т.к. поле Jump скрыто
        swipeLaunchControls.style.display = 'none';
        sortControls.style.display = 'none'; // Скрываем сортировку для избранного
        currentView = 'favorites';

        // Обновляем счетчик для отображения количества избранных
        styleCounter.innerHTML = `Styles in Favorites: <span class="style-count-number">${favorites.size.toLocaleString('en-US')}</span>`;

        // Сбрасываем состояние "перехода", так как он не применяется к избранному
        startIndexOffset = 0;
        jumpInput.value = '';
        
        // Также сбрасываем состояние перехода и разблокируем другие контролы
        resetJumpState(false); // false - чтобы не вызывать renderView() повторно

        // Очищаем поиск при переключении на избранное
        if (searchInput.value) {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        renderView();
    });

    // --- Сохранение избранных в файл ---
    const saveFavoritesBtn = document.getElementById('save-favorites-btn');
    const importFavoritesBtn = document.getElementById('import-favorites-btn');
    const exportTxtBtn = document.getElementById('export-txt-btn');

    importFavoritesBtn.addEventListener('click', () => {
        importFavoritesInput.click();
    });

    importFavoritesInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.favorites || !Array.isArray(data.favorites)) {
                    throw new Error('Invalid file format');
                }

                let importedCount = 0;
                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);

                data.favorites.forEach(fav => {
                    // Проверяем, что ID существует и его еще нет в избранном
                    if (fav.id && fav.timestamp && !favorites.has(String(fav.id))) {
                        store.put({ id: String(fav.id), timestamp: fav.timestamp });
                        importedCount++;
                    }
                });

                await new Promise(resolve => transaction.oncomplete = resolve);
                await loadFavoritesFromDB(); // Перезагружаем избранное из БД
                renderView(); // Обновляем отображение
                // Обновляем счетчик после импорта
                styleCounter.innerHTML = `Styles in Favorites: <span class="style-count-number">${favorites.size.toLocaleString('en-US')}</span>`;
                showToast(importedCount > 0 
                    ? `${importedCount} new favorites imported!`
                    : 'No new favorites to import.');

            } catch (error) {
                console.error('Error importing favorites:', error);
                showToast('Error: Could not import favorites. Invalid file.');
            } finally {
                // Сбрасываем значение input, чтобы можно было загрузить тот же файл снова
                importFavoritesInput.value = '';
            }
        };
        reader.readAsText(file);
    });

    saveFavoritesBtn.addEventListener('click', () => {
        if (favorites.size === 0) {
            showToast('You have no favorites to save.');
            return;
        }

        // Преобразуем Map в массив объектов, содержащих только id и timestamp
        const favoritesToSave = Array.from(favorites.entries())
          .map(([id, timestamp]) => ({ id, timestamp }))
          .sort((a, b) => b.timestamp - a.timestamp); // Сортируем по дате добавления

        const exportData = {
            metadata: {
                appName: "Anima Style Explorer",
                exportDate: new Date().toISOString(),
                favoritesCount: favoritesToSave.length
            },
            favorites: favoritesToSave
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        a.download = `anima-style-favorites-${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Favorites exported to JSON file!');
    });

    exportTxtBtn.addEventListener('click', () => {
        if (favorites.size === 0) {
            showToast('You have no favorites to save.');
            return;
        }

        // 1. Получаем ID избранных и сортируем их по дате добавления (новые сверху)
        const sortedFavoriteIds = Array.from(favorites.entries())
            .sort(([, timestampA], [, timestampB]) => timestampB - timestampA)
            .map(([id]) => id);

        // 2. Находим имена художников по их ID
        const artistNames = sortedFavoriteIds.map(id => {
            const artistData = allItems.find(item => item.id === id);
            return artistData ? artistData.artist : null;
        }).filter(Boolean); // Убираем null, если художник не был найден

        // 3. Создаем текстовый файл
        const textContent = artistNames.join('\n');
        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        a.download = `anima-style-favorites-artists-${date}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // Обработка ввода в строке поиска
    searchInput.addEventListener('input', (e) => {
        const newSearchTerm = e.target.value.toLowerCase().trim();
        const isSearching = newSearchTerm.length > 0;
        clearSearchBtn.style.display = isSearching ? 'flex' : 'none';

        // Если пользователь очистил поиск, сбрасываем смещение от "перехода"
        if (searchTerm.length > 0 && !isSearching) {
            startIndexOffset = 0;
        }

        searchTerm = newSearchTerm;
        updateControlsState(); // Обновляем состояние контролов
        renderView();
    });
    
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        // Инициируем событие 'input', чтобы сработала вся логика очистки
        const event = new Event('input', { bubbles: true });
        searchInput.dispatchEvent(event);
    });

    // Скрываем клавиатуру на мобильных при нажатии Enter
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && window.innerWidth <= 992) {
            e.preventDefault(); // Предотвращаем стандартное поведение (например, отправку формы)
            e.target.blur();
        }
    });

    // --- Логика перехода к номеру ---
    function handleJump(isReset = false) {
        const targetValue = parseInt(jumpInput.value, 10);
        if (isReset || !jumpInput.value) {
            resetJumpState();
            return;
        }

        // Если активна сортировка по уникальности, переходим к рангу
        if (sortType === 'uniqueness') {
            const targetRank = targetValue;
            if (isNaN(targetRank) || targetRank < 1) {
                resetJumpState();
                return;
            }
            if (targetRank > allItems.length) {
                galleryContainer.innerHTML = `<p style="text-align: center; grid-column: 1 / -1;">Rank not found. The highest rank is ${allItems.length.toLocaleString('en-US')}.</p>`;
                // Не сбрасываем состояние, чтобы пользователь видел, что ввел
                return;
            }
            // Ранг начинается с 1, а индекс с 0
            startIndexOffset = Math.max(0, targetRank - 1);
            // Сортировка уже правильная, просто перерисовываем
            renderView();
        } else {
            // Старая логика для перехода по количеству работ
            const targetWorksCount = targetValue;

            // Сохраняем текущую сортировку, если это первый ввод в поле Jump
            if (previousSortType === null) {
                previousSortType = sortType;
                previousSortDirection = sortDirection;
            }

            const foundIndex = itemsSortedByWorks.findIndex(item => item.worksCount <= targetWorksCount);

            if (foundIndex === -1) {
                showToast('No artists found with that many works or less.');
                return;
            }

            // Блокируем другие контролы, ТОЛЬКО ЕСЛИ переход успешен
            searchInput.value = ''; // Очищаем поле поиска
            searchTerm = ''; // Сбрасываем поисковый запрос
            updateControlsState(); // Обновляем состояние контролов

            // Устанавливаем смещение точно на найденный индекс, без запаса
            startIndexOffset = foundIndex;
            // Принудительно устанавливаем сортировку по работам (по убыванию)
            sortType = 'works';
            sortDirection = 'desc';
            renderView();
        }

        // Скрываем клавиатуру на мобильных после успешного перехода
        if (window.innerWidth <= 992) {
            jumpInput.blur();
        }
    }

    function resetJumpState(shouldRender = true) {
        startIndexOffset = 0;

        // Если мы были в режиме перехода по рангу, не меняем сортировку
        if (sortType === 'uniqueness') {
            previousSortType = null;
        }

        // Восстанавливаем предыдущую сортировку, если она была сохранена
        if (previousSortType !== null) {
            sortType = previousSortType;
            sortDirection = previousSortDirection;
            previousSortType = null; // Сбрасываем сохраненное состояние
            previousSortDirection = null;
        }

        updateSortButtonsUI(); // Обновляем UI кнопок сортировки
        updateControlsState(); // Обновляем состояние контролов


        jumpInput.value = ''; // Очищаем поле только после всех операций
        if (shouldRender) {
            renderView();
        }
        
        // Убедимся, что кнопка сброса скрыта, если поле ввода уже пустое
        if (!jumpInput.value) {
            clearJumpBtn.style.display = 'none';
        }
    }

    jumpInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault(); // Блокируем стандартное поведение инкремента/декремента
            return;
        }
        if (e.key === 'Enter') {
            clearTimeout(jumpTimeout); // Отменяем предыдущий таймер, если есть
            handleJump();
        }
    });

    jumpInput.addEventListener('input', () => {
        // Показываем/скрываем крестик в зависимости от наличия текста
        if (jumpInput.value) {
            clearJumpBtn.style.display = 'flex';
        } else {
            // Если поле очищено вручную (например, Backspace), сбрасываем состояние
            resetJumpState();
        }

        updateControlsState(); // Обновляем состояние контролов при каждом вводе

        clearTimeout(jumpTimeout); // Сбрасываем таймер при каждом вводе
        if (jumpInput.value.trim()) { // Запускаем таймер только если в поле что-то есть
            jumpTimeout = setTimeout(() => handleJump(), 800); // Задержка 800мс
        }
    });

    clearJumpBtn.addEventListener('click', () => resetJumpState());

    // --- Управление сортировкой ---
    function updateSortButtonsUI() {
        // Сброс состояния для обеих кнопок
        [sortByNameBtn, sortByWorksBtn, sortByUniquenessBtn].forEach(btn => {
            btn.classList.remove('active');
            btn.querySelector('.sort-arrow').textContent = '';
        });

        // Обновляем состояние блокировки контролов
        updateControlsState();
        
        // Обновляем активную кнопку и стрелку
        let activeBtn;
        if (sortType === 'name') {
            activeBtn = sortByNameBtn;
        } else if (sortType === 'works') {
            activeBtn = sortByWorksBtn;
        } else { // uniqueness
            activeBtn = sortByUniquenessBtn;
        }
        
        const arrow = activeBtn.querySelector('.sort-arrow');
        activeBtn.classList.add('active');
        arrow.textContent = sortDirection === 'asc' ? '▲' : '▼';
    }

    function handleSortClick(clickedType) {
        // Если активируем "Uniqueness", сбрасываем все остальные фильтры
        if (clickedType === 'uniqueness' && sortType !== 'uniqueness') {
            resetJumpState(false); // Сбрасываем "Jump"
            
            // Прямой сброс поиска вместо имитации клика для надежности
            if (searchInput.value !== '') {
                searchInput.value = '';
                searchTerm = '';
                clearSearchBtn.style.display = 'none';
            }
        }

        if (sortType === clickedType) {
            // Если кликнули по активной кнопке, меняем направление,
            // но для 'uniqueness' направление всегда 'desc' и не меняется.
            if (clickedType !== 'uniqueness') {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            }
        } else {
            // Если кликнули по новой кнопке, активируем ее
            sortType = clickedType;
            // Устанавливаем направление по умолчанию
            // Для 'name' - asc, для 'works' и 'uniqueness' - desc.
            sortDirection = sortType === 'name' ? 'asc' : 'desc';
        }
        updateSortButtonsUI();

        // Отложенное сохранение в localStorage
        clearTimeout(sortUpdateTimeout);
        sortUpdateTimeout = setTimeout(() => {
            localStorage.setItem(SORT_TYPE_KEY, sortType);
            localStorage.setItem(SORT_DIRECTION_KEY, sortDirection);
        }, 1000); // Задержка в 1 секунду
        renderView();
    }

    sortByNameBtn.addEventListener('click', () => handleSortClick('name'));
    sortByWorksBtn.addEventListener('click', () => handleSortClick('works'));
    sortByUniquenessBtn.addEventListener('click', () => handleSortClick('uniqueness'));

    // --- Конец управления сортировкой ---

    // --- Управление сеткой ---
    function handleGridHotkeys(e) {
        // Не меняем колонки, если фокус на поле ввода
        if (e.target.tagName === 'INPUT') return;

        // Добавляем проверку на отсутствие клавиш-модификаторов
        if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) {
            return; // Если нажата любая клавиша-модификатор, выходим
        }

        const key = parseInt(e.key, 10);

        // Если нажата цифра от 1 до 9
        if (key >= 4 && key <= 9) {
            gridSlider.value = key;
            updateGridColumns(key);
            triggerGridSave(key);
        }
        // Если нажат 0, ставим 10 колонок
        else if (key === 0) {
            gridSlider.value = 10;
            updateGridColumns(10);
            triggerGridSave(10);
        }
    }

    document.addEventListener('keydown', handleGridHotkeys);




    let gridUpdateTimeout;
    const GRID_COLUMN_KEY = 'gridColumnCount';

    // Обработка изменения ползунка
    function updateGridColumns(value) {
        document.documentElement.style.setProperty('--grid-columns', value);
        gridSliderValue.textContent = value;
    }

    function triggerGridSave(value) {
        // Отложенное сохранение значения в localStorage
        clearTimeout(gridUpdateTimeout);
        gridUpdateTimeout = setTimeout(() => {
            localStorage.setItem(GRID_COLUMN_KEY, value);
            // После изменения сетки может понадобиться догрузить элементы
            // Даем небольшую задержку, чтобы DOM успел перестроиться
            setTimeout(checkAndLoadMoreIfContentDoesNotFillScreen, 100);
        }, 500); // Задержка в 0.5 секунды
    }

    gridSlider.addEventListener('input', (e) => {
        const value = e.target.value;
        updateGridColumns(value);
        triggerGridSave(value);
    });

    // --- Инициализация ---

    // Загружаем и применяем сохраненное количество колонок только на десктопе
    if (window.innerWidth > 992) {
        let savedColumnCount = parseInt(localStorage.getItem(GRID_COLUMN_KEY) || '5', 10);
        // Проверяем, что сохраненное значение находится в новом допустимом диапазоне (4-10)
        if (savedColumnCount < 4) {
            savedColumnCount = 4;
            localStorage.setItem(GRID_COLUMN_KEY, savedColumnCount);
        }
        gridSlider.value = savedColumnCount;
        updateGridColumns(savedColumnCount);
    }

    // Загружаем и применяем сохраненные параметры сортировки
    const savedSortType = localStorage.getItem(SORT_TYPE_KEY);
    const savedSortDirection = localStorage.getItem(SORT_DIRECTION_KEY);
    if (savedSortType && savedSortDirection) {
        sortType = savedSortType;
        sortDirection = savedSortDirection;
    }

    // Устанавливаем начальное состояние сортировки
    updateSortButtonsUI();


    initDB()
        .then(() => {
            loadInitialData();
        })
        .catch(err => {
            console.error(err);
            galleryContainer.innerHTML = '<p style="text-align: center; grid-column: 1 / -1;">Failed to initialize database.</p>';
        });

});
