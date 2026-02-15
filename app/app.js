﻿document.addEventListener('DOMContentLoaded', () => {
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


    let allItems = [];
    let favorites = new Set(); // Используем Set для быстрого доступа
    let currentItems = [];
    let currentPage = 0;
    const itemsPerPage = 20;
    let searchTerm = ''; // 'gallery', 'favorites'
    let currentView = 'gallery'; // 'gallery', 'favorites', or 'about'
    let sortType = 'works'; // 'name' or 'works'
    let sortDirection = 'desc'; // 'asc' or 'desc'
    let isLoading = false;
    let sortUpdateTimeout; // Переменная для таймера сохранения сортировки
    const SORT_TYPE_KEY = 'sortType';
    const SORT_DIRECTION_KEY = 'sortDirection';


    // --- Инициализация плавной прокрутки (Lenis) ---
    const lenis = new Lenis({
        smoothWheel: false, // Отключаем плавную прокрутку для колесика мыши
    });

    function raf(time) {
        lenis.raf(time);
        requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);
    // --- Конец инициализации плавной прокрутки ---


    // --- Функции создания элементов ---

    // --- IndexedDB ---
    let db;
    const DB_NAME = 'StyleGalleryDB';
    const STORE_NAME = 'favorites';

    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);

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
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'artist' });
                }
            };
        });
    }

    async function loadFavoritesFromDB() {
        return new Promise((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const getAllRequest = store.getAll();
            getAllRequest.onsuccess = () => {
                favorites = new Set(getAllRequest.result.map(item => item.artist));
                resolve();
            };
        });
    }

    function createCard(item) {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.artist = item.artist;

        const isFavorited = favorites.has(item.artist);

        card.innerHTML = `
            <img class="card__image" src="${item.image}" alt="${item.artist}" loading="lazy" width="832" height="1216">
            <div class="card__info">
                <p class="card__artist">${item.artist}</p>
            </div>
            <div class="works-count" title="Approximate number of training images for this artistic style">
                ${item.worksCount.toLocaleString('en-US')}
            </div>
            <button 
                class="favorite-button ${isFavorited ? 'favorited' : ''}" 
                aria-label="${isFavorited ? 'Remove from favorites' : 'Add to favorites'}"
                title="${isFavorited ? 'Remove from favorites' : 'Add to favorites'}"
            >
                ${isFavorited ? '★' : '☆'}
            </button>
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
            toggleFavorite(item.artist, favButton);
        });

        return card;
    }

    // --- Функции управления данными и отображением ---

    async function loadInitialData() {
        try {
            // Данные теперь берутся из глобальной переменной galleryData из файла data.js
            if (typeof galleryData === 'undefined') throw new Error('galleryData is not defined.');
            
            // Преобразуем новый формат данных в старый, с которым работает приложение
            allItems = galleryData.map(item => ({
                artist: item.name, // Используем 'name' как 'artist'
                image: `images/${item.p}/${item.id}.webp`, // Генерируем путь к изображению с учетом подпапки 'p'
                worksCount: item.post_count, // Используем 'post_count' как 'worksCount'
                id: item.id // Сохраняем id для возможного будущего использования
            }));

            // Обновляем счетчик стилей
            styleCounter.textContent = `Artist-based styles: ${allItems.length.toLocaleString('en-US')}`;

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
        
        // 1. Сортируем данные
        let sortedItems = [...allItems];
        if (sortType === 'name') {
            if (sortDirection === 'asc') {
                sortedItems.sort((a, b) => a.artist.localeCompare(b.artist));
            } else {
                sortedItems.sort((a, b) => b.artist.localeCompare(a.artist));
            }
        } else if (sortType === 'works') {
            if (sortDirection === 'desc') {
                sortedItems.sort((a, b) => b.worksCount - a.worksCount);
            } else { // asc
                sortedItems.sort((a, b) => a.worksCount - b.worksCount);
            }
        }
        
        // 2. Фильтруем по строке поиска
        let filteredItems = allItems;
        if (searchTerm) {
            filteredItems = sortedItems.filter(item => 
                item.artist.toLowerCase().includes(searchTerm)
            );
        } else {
            filteredItems = sortedItems;
        }

        // 3. Фильтруем по текущей вкладке (Галерея или Избранное)
        if (currentView === 'gallery') {
            currentItems = filteredItems;
        } else { // favorites
            currentItems = filteredItems.filter(item => favorites.has(item.artist));
        }
        if (currentItems.length === 0 && currentView === 'favorites') {
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

    async function toggleFavorite(artistName, button) {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        if (favorites.has(artistName)) {
            // Удалить из избранного
            store.delete(artistName);
            favorites.delete(artistName);
            button.textContent = '☆';
            button.title = 'Add to favorites';
            button.setAttribute('aria-label', 'Add to favorites');
            button.classList.remove('favorited');
            showToast('Removed from favorites');
        } else {
            // Добавить в избранное
            store.put({ artist: artistName });
            favorites.add(artistName);
            button.textContent = '★';
            button.title = 'Remove from favorites';
            button.setAttribute('aria-label', 'Remove from favorites');
            button.classList.add('favorited');
            showToast('Added to favorites');
        }

        // Если мы в избранном, нужно сразу обновить вид
        if (currentView === 'favorites') {
            renderView();
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

    // --- Обработчики событий ---

    // Появление/скрытие кнопки "Наверх"
    lenis.on('scroll', (e) => {
        // Появление/скрытие кнопки "Наверх"
        if (e.scroll > 300) {
            scrollToTopBtn.classList.add('visible');
        } else {
            scrollToTopBtn.classList.remove('visible');
        }

        // Проверяем, достигли ли мы конца страницы
        if (!isLoading && (e.scroll + window.innerHeight) >= document.body.offsetHeight - 200) {
            if (currentPage * itemsPerPage < currentItems.length) {
                loadMoreItems();
            }
        }
    });
    
    // Клик по кнопке "Наверх"
    scrollToTopBtn.addEventListener('click', () => {
        lenis.scrollTo(0, { duration: 1.5 }); // Плавная прокрутка наверх с помощью Lenis
    });

    tabGallery.addEventListener('click', () => {
        if (currentView === 'gallery') return;
        setActiveTab(tabGallery);
        favoritesControlsWrapper.style.display = 'none';
        currentView = 'gallery';
        renderView();
    });

    tabFavorites.addEventListener('click', () => {
        if (currentView === 'favorites') return;
        setActiveTab(tabFavorites);
        favoritesControlsWrapper.style.display = 'flex';
        currentView = 'favorites';
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
        const textToSave = Array.from(favorites).join('\n');
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
        searchTerm = e.target.value.toLowerCase().trim();
        renderView();
    });

    // --- Управление сортировкой ---
    function updateSortButtonsUI() {
        // Сброс состояния для обеих кнопок
        [sortByNameBtn, sortByWorksBtn].forEach(btn => {
            btn.classList.remove('active');
            btn.querySelector('.sort-arrow').textContent = '';
        });

        const activeBtn = sortType === 'name' ? sortByNameBtn : sortByWorksBtn;
        const arrow = activeBtn.querySelector('.sort-arrow');

        activeBtn.classList.add('active');
        arrow.textContent = sortDirection === 'asc' ? '▲' : '▼';
    }

    function handleSortClick(clickedType) {
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




    let gridUpdateTimeout;
    const GRID_COLUMN_KEY = 'gridColumnCount';

    // Обработка изменения ползунка
    function updateGridColumns(value) {
        document.documentElement.style.setProperty('--grid-columns', value);
        gridSliderValue.textContent = value;
    }

    gridSlider.addEventListener('input', (e) => {
        const value = e.target.value;
        updateGridColumns(value);

        // Отложенное сохранение значения в localStorage
        clearTimeout(gridUpdateTimeout);
        gridUpdateTimeout = setTimeout(() => {
            localStorage.setItem(GRID_COLUMN_KEY, value);
            // После изменения сетки может понадобиться догрузить элементы
            // Даем небольшую задержку, чтобы DOM успел перестроиться
            setTimeout(checkAndLoadMoreIfContentDoesNotFillScreen, 100);
        }, 1000); // Задержка в 1 секунду
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
        const targetArtists = 5000;
        const percentage = Math.min((currentArtists / targetArtists) * 100, 100);

        progressCurrent.textContent = currentArtists.toLocaleString('en-US');
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
