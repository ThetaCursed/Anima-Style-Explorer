﻿document.addEventListener('DOMContentLoaded', () => {
    const DEBUG_MODE = false; // Установите true, чтобы включить проверку путей к изображениям

    const galleryContainer = document.getElementById('gallery-container');
    const loader = document.getElementById('loader');
    const tabGallery = document.getElementById('tab-gallery');
    const tabFavorites = document.getElementById('tab-favorites');
    const searchInput = document.getElementById('search-input');
    const sortByNameBtn = document.getElementById('sort-by-name');
    const sortByWorksBtn = document.getElementById('sort-by-works');
    const scrollToTopBtn = document.getElementById('scroll-to-top');
    const gridSlider = document.getElementById('grid-slider');
    const gridSliderValue = document.getElementById('grid-slider-value');
    const controlsContainer = document.getElementById('controls-container');
    const favoritesControlsWrapper = document.getElementById('favorites-controls-wrapper');
    const styleCounter = document.getElementById('style-counter');
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
    let sortType = 'name'; // 'name' or 'works'
    let sortDirection = 'desc'; // 'asc' or 'desc'
    let isLoading = false;
    let sortUpdateTimeout; // Переменная для таймера сохранения сортировки
    let previousSortType = null; // Для восстановления сортировки после "Jump"
    let previousSortDirection = null; // Для восстановления сортировки после "Jump"
    let jumpTimeout; // Таймер для отложенного перехода
    const SORT_TYPE_KEY = 'sortType';
    const SORT_DIRECTION_KEY = 'sortDirection';




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
                    ${isFavorited ? '★' : '☆'}
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
                    image: `images/${item.p}/${item.id}.webp`,
                    worksCount: item.post_count,
                    id: item.id
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
        }
        
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


        if (currentItems.length === 0 && currentView === 'favorites' && startIndexOffset === 0) {
            galleryContainer.innerHTML = '<p style="text-align: center; grid-column: 1 / -1;">No favorites yet.</p>';
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

    async function toggleFavorite(item, button) {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        if (favorites.has(item.id)) {
            // Удалить из избранного
            store.delete(item.id);
            favorites.delete(item.id);
            showToast('Removed from favorites');
            if (currentView === 'gallery') {
                button.textContent = '☆';
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
            button.textContent = '★';
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
                }, { once: true }); // Событие сработает только один раз
            }
        }
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

    tabGallery.addEventListener('click', () => {
        if (currentView === 'gallery') return;
        setActiveTab(tabGallery);
        favoritesControlsWrapper.style.display = 'none'; // Скрываем кнопку экспорта
        jumpControls.style.display = 'flex';
        sortControls.style.display = 'flex';
        currentView = 'gallery';
        renderView();

        // Очищаем поиск при переключении на галерею
        if (searchInput.value) {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });

    tabFavorites.addEventListener('click', () => {
        if (currentView === 'favorites') return;
        setActiveTab(tabFavorites);
        favoritesControlsWrapper.style.display = 'block'; // Показываем кнопку экспорта
        jumpControls.style.display = 'none';
        sortControls.style.display = 'none'; // Скрываем сортировку для избранного
        currentView = 'favorites';
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
    saveFavoritesBtn.addEventListener('click', () => {
        if (favorites.size === 0) {
            showToast('You have no favorites to save.');
            return;
        }

        // Собираем имена артистов, по одному на строку
        // Сортируем по дате добавления (новые сверху) перед сохранением
        const sortedFavoriteIds = Array.from(favorites.entries())
            .sort(([, tsA], [, tsB]) => tsB - tsA)
            .map(([id]) => id);

        const textToSave = sortedFavoriteIds.map(id => allItems.find(item => item.id === id)?.artist)
            .filter(Boolean).join('\n');
        const blob = new Blob([textToSave], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'favorite-artists.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Favorites saved to file!');
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
            e.target.blur();
        }
    });

    // Скрываем клавиатуру на мобильных после завершения ввода (нажатия "Готово" или "Поиск")
    searchInput.addEventListener('change', (e) => {
        e.target.blur();
    });

    // --- Логика перехода к номеру ---
    function handleJump(isReset = false) {
        const targetWorksCount = parseInt(jumpInput.value, 10);
        if (isReset || !jumpInput.value) {
            resetJumpState();
            return;
        }

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
        if (foundIndex !== -1) {
            searchInput.value = ''; // Очищаем поле поиска
            searchTerm = ''; // Сбрасываем поисковый запрос
            updateControlsState(); // Обновляем состояние контролов
        }

        // Устанавливаем смещение точно на найденный индекс, без запаса
        startIndexOffset = foundIndex;
        
        // Принудительно устанавливаем сортировку по работам (по убыванию)
        sortType = 'works';
        sortDirection = 'desc';
        

        renderView();

        // Скрываем клавиатуру на мобильных после успешного перехода
        if (window.innerWidth <= 992) {
            jumpInput.blur();
        }
    }

    function resetJumpState(shouldRender = true) {
        startIndexOffset = 0;

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
        jumpTimeout = setTimeout(() => handleJump(), 800); // Задержка 800мс
    });

    clearJumpBtn.addEventListener('click', () => resetJumpState());

    // --- Управление сортировкой ---
    function updateSortButtonsUI() {
        // Сброс состояния для обеих кнопок
        [sortByNameBtn, sortByWorksBtn].forEach(btn => {
            btn.classList.remove('active');
            btn.querySelector('.sort-arrow').textContent = '';
        });

        // Обновляем состояние блокировки контролов
        updateControlsState();

        // Обновляем активную кнопку и стрелку
        const activeBtn = sortType === 'name' ? sortByNameBtn : sortByWorksBtn;
        const arrow = activeBtn.querySelector('.sort-arrow');

        activeBtn.classList.add('active');
        arrow.textContent = sortDirection === 'asc' ? '▲' : '▼';
    }

    function handleSortClick(clickedType) {
        resetJumpState(false); // Сортировка всегда сбрасывает режим "перехода" без ре-рендера
        if (sortType === clickedType) {
            // Если кликнули по активной кнопке, меняем направление
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            // Если кликнули по новой кнопке, активируем ее
            sortType = clickedType;
            // Устанавливаем направление по умолчанию
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

    // --- Конец управления сортировкой ---

    // --- Управление сеткой ---
    function handleGridHotkeys(e) {
        // Не меняем колонки, если фокус на поле ввода
        if (e.target.tagName === 'INPUT') return;

        const key = parseInt(e.key, 10);

        // Если нажата цифра от 1 до 9
        if (key >= 1 && key <= 9) {
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
        const savedColumnCount = localStorage.getItem(GRID_COLUMN_KEY) || '5';
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

    // --- Логика виджета поддержки ---
    const supportWidget = document.getElementById('support-widget');
    const closeSupportWidgetBtn = document.getElementById('support-widget-close');
    const progressCurrent = document.getElementById('progress-current');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressTarget = document.getElementById('progress-target');
    // const styleCounter = document.getElementById('style-counter'); // Уже определен выше
    const WIDGET_HIDDEN_KEY = 'supportWidgetHiddenUntil';

    function initSupportWidget() {
        const hiddenUntil = localStorage.getItem(WIDGET_HIDDEN_KEY);
        if (hiddenUntil && Date.now() < parseInt(hiddenUntil, 10)) {
            supportWidget.classList.add('hidden');
            return;
        } else {
            styleCounter.classList.add('hidden-by-widget'); // Скрываем счетчик, если виджет будет показан
        }

        // Обновляем прогресс-бар
        const currentArtists = allItems.length;
        const targetArtists = 20000;
        const percentage = Math.min((currentArtists / targetArtists) * 100, 100);

        progressCurrent.textContent = currentArtists.toLocaleString('en-US');
        progressTarget.textContent = targetArtists.toLocaleString('en-US');
        // Небольшая задержка для анимации
        setTimeout(() => {
            progressBarFill.style.width = `${percentage}%`;
        }, 300);

        supportWidget.classList.remove('hidden');
    }

    closeSupportWidgetBtn.addEventListener('click', () => {
        supportWidget.classList.add('hidden');
        styleCounter.classList.remove('hidden-by-widget'); // Показываем счетчик обратно
        // Скрываем на 10 часов
        const hideUntil = Date.now() + (10 * 60 * 60 * 1000);
        localStorage.setItem(WIDGET_HIDDEN_KEY, hideUntil);
    });

    // Вызываем инициализацию после загрузки основных данных
    // Добавляем вызов в конец функции loadInitialData
    const originalLoadInitialData = loadInitialData;
    loadInitialData = async function() {
        await originalLoadInitialData.apply(this, arguments);
        initSupportWidget(); // Инициализируем виджет после загрузки данных
    };
});
