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
    const sortByRatingBtn = document.getElementById('sort-by-rating');
    const uniquenessMinSlider = document.getElementById('uniqueness-min-slider');
    const uniquenessMaxSlider = document.getElementById('uniqueness-max-slider');
    const uniquenessRangeText = document.getElementById('uniqueness-range-text');
    const sliderTrackActive = document.getElementById('slider-track-active');
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
    let favorites = new Map(); // Используем Map для хранения {id: {timestamp, rating}}
    let currentItems = [];
    let currentPage = 0;
    let startIndexOffset = 0; // Смещение для "перехода к номеру"
    const itemsPerPage = 20;
    let searchTerm = ''; // 'gallery', 'favorites'
    let currentView = 'gallery'; // 'gallery', 'favorites', or 'about'
    let uniquenessMinFilter = 0;
    let uniquenessMaxFilter = 100;
    let sortType = 'name'; // 'name' or 'works'
    let sortDirection = 'asc'; // 'asc' or 'desc'
    let isLoading = false;
    let sortUpdateTimeout; // Переменная для таймера сохранения сортировки
    let jumpTimeout; // Таймер для отложенного перехода
    let observer; // Intersection Observer
    const SORT_TYPE_KEY = 'sortType';
    const SORT_DIRECTION_KEY = 'sortDirection';




    // --- Функции создания элементов ---

    // --- IndexedDB ---
    let db;
    const DB_NAME = 'StyleGalleryDB';
    const STORE_NAME = 'favorites';

    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 3); // Version 3 for ratings

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
                    const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                    objectStore.createIndex('rating', 'rating', { unique: false });
                } else {
                    const objectStore = event.currentTarget.transaction.objectStore(STORE_NAME);
                    if (!objectStore.indexNames.contains('rating')) {
                        objectStore.createIndex('rating', 'rating', { unique: false });
                    }
                }
            };
        });
    }

    async function loadFavoritesFromDB() {
        return new Promise((resolve) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const objectStore = transaction.objectStore(STORE_NAME);
            const request = objectStore.getAll();
            request.onsuccess = () => {
                favorites = new Map(request.result.map(item => [item.id, { 
                    timestamp: item.timestamp, 
                    rating: item.rating || 0 
                }]));
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

        const favData = favorites.get(item.id);
        const isFavorited = !!favData;
        const rating = favData ? favData.rating : 0;
        
        const uniquenessPercent = Math.round(item.uniqueness * 100);

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

        // Star rating HTML
        let starsHTML = '';
        for (let i = 1; i <= 5; i++) {
            starsHTML += `<span class="star ${i <= rating ? 'active' : ''}" data-value="${i}">★</span>`;
        }

        card.innerHTML = `
            <img class="card__image" src="${item.image}" alt="${item.artist}" loading="lazy" width="832" height="1216">
            <div class="card__info">
                <p class="card__artist">${item.artist}</p>
                <div class="star-rating" title="Rate this style">
                    ${starsHTML}
                </div>
            </div>
            <div class="uniqueness-score" title="Artistic Uniqueness (AI analyzed)">
                ${uniquenessPercent}% Unique
            </div>
            <div class="works-count" title="Approximate number of training images for this artistic style">
                ${item.worksCount.toLocaleString('en-US')}
            </div>
            ${favButtonHTML}
        `;

        // Обработка клика по звездам
        card.querySelectorAll('.star').forEach(star => {
            star.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = parseInt(star.dataset.value);
                updateRating(item, val);
            });
        });

        // Копирование имени по клику на карточку (кроме кнопки "избранное" и звезд)
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('favorite-button') && !e.target.classList.contains('star')) {
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

    async function updateRating(item, newRating) {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        let favData = favorites.get(item.id);
        if (!favData) {
            // Auto-favorite if rated from gallery
            favData = { id: item.id, timestamp: Date.now(), rating: newRating };
            favorites.set(item.id, { timestamp: favData.timestamp, rating: newRating });
            showToast(`Style favorited and rated ${newRating} stars`);
        } else {
            // Toggle rating: if clicking the same rating, reset to 0
            const updatedRating = favData.rating === newRating ? 0 : newRating;
            favData = { id: item.id, timestamp: favData.timestamp, rating: updatedRating };
            favorites.set(item.id, { timestamp: favData.timestamp, rating: updatedRating });
            showToast(`Rating updated to ${updatedRating} stars`);
        }
        
        await store.put(favData);
        
        // Silent update: We NEVER trigger renderView() here anymore.
        // This prevents cards from jumping around while the user is rating them.
        const card = document.querySelector(`.card[data-id="${item.id}"]`);
        if (card) {
            const starContainer = card.querySelector('.star-rating');
            if (starContainer) {
                let starsHTML = '';
                const currentRating = favorites.get(item.id).rating;
                for (let i = 1; i <= 5; i++) {
                    starsHTML += `<span class="star ${i <= currentRating ? 'active' : ''}" data-value="${i}">★</span>`;
                }
                starContainer.innerHTML = starsHTML;
                // Re-attach listeners to the new star elements
                starContainer.querySelectorAll('.star').forEach(star => {
                    star.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const val = parseInt(star.dataset.value);
                        updateRating(item, val);
                    });
                });
            }
            
            // If we favorited a card in Gallery view, update the heart/star button too
            if (currentView === 'gallery') {
                const favButton = card.querySelector('.favorite-button');
                if (favButton) {
                    favButton.textContent = '★';
                    favButton.classList.add('favorited');
                    favButton.title = 'Remove from favorites';
                }
            }
        }
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
                    id: item.id,
                    uniqueness: item.uniqueness || 0
                }));

                // Создаем заранее отсортированную копию для функции jump
                itemsSortedByWorks = [...allItems].sort((a, b) => b.worksCount - a.worksCount);
            }

            // Запускаем отладочную проверку изображений
            await debug_checkImagePaths();

            // Обновляем счетчик стилей
            styleCounter.innerHTML = `Artist-based styles: <span class="style-count-number">${allItems.length.toLocaleString('en-US')}</span>`;

            await loadFavoritesFromDB(); 
            updateSliderUI();
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
            sortedItems.sort((a, b) => (a.worksCount - b.worksCount) * direction);
        } else if (sortType === 'uniqueness') {
            sortedItems.sort((a, b) => (a.uniqueness - b.uniqueness) * direction);
        } else if (sortType === 'rating') {
            sortedItems.sort((a, b) => {
                const rA = favorites.get(a.id)?.rating || 0;
                const rB = favorites.get(b.id)?.rating || 0;
                return (rA - rB) * direction;
            });
        }
        
        // 2. Фильтруем по избранному, если нужно
        if (currentView === 'favorites') {
            sortedItems = sortedItems.filter(item => favorites.has(item.id));
            // По умолчанию для избранного - по времени (timestamp)
            if (!sortType || (sortType === 'name' && sortDirection === 'asc' && !localStorage.getItem(SORT_TYPE_KEY))) {
                 sortedItems.sort((a, b) => favorites.get(b.id).timestamp - favorites.get(a.id).timestamp);
            }
        }

        // 3. Фильтруем по Uniqueness
        sortedItems = sortedItems.filter(item => {
            const val = item.uniqueness * 100;
            return val >= uniquenessMinFilter && val <= uniquenessMaxFilter;
        });

        // 4. Фильтруем по строке поиска (Fuzzy-ish simple match)
        let filteredItems;
        if (searchTerm) {
            const term = searchTerm.toLowerCase().replace(/\s/g, '');
            filteredItems = sortedItems.filter(item => 
                item.artist.toLowerCase().replace(/\s/g, '').includes(term)
            );
        } else {
            filteredItems = sortedItems;
        }

        // 5. Применяем смещение для "перехода к номеру" (только для галереи)
        currentItems = filteredItems.slice(startIndexOffset);


        if (currentItems.length === 0 && currentView === 'favorites' && startIndexOffset === 0) {
            galleryContainer.innerHTML = '<p style="text-align: center; grid-column: 1 / -1;">No favorites yet.</p>';
            return;
        }
        
        loadMoreItems();
        setupObserver();
    }

    function loadMoreItems() {
        if (isLoading) return;
        
        const start = currentPage * itemsPerPage;
        if (start >= currentItems.length) {
            // No more items, remove sentinel
            const sentinel = document.getElementById('infinite-scroll-sentinel');
            if (sentinel) sentinel.remove();
            return;
        }

        isLoading = true;
        loader.style.display = 'block';

        const end = start + itemsPerPage;
        const itemsToLoad = currentItems.slice(start, end);
        
        const fragment = document.createDocumentFragment();
        itemsToLoad.forEach(item => {
            fragment.appendChild(createCard(item));
        });
        
        // Remove sentinel before appending new items to ensure it stays at the bottom
        const sentinel = document.getElementById('infinite-scroll-sentinel');
        if (sentinel) sentinel.remove();
        
        galleryContainer.appendChild(fragment);

        currentPage++;
        isLoading = false;
        loader.style.display = 'none';
        
        // Re-setup sentinel at the new bottom
        setupObserver();

        if (galleryContainer.scrollHeight <= window.innerHeight && (currentPage * itemsPerPage < currentItems.length)) {
            loadMoreItems();
        }
    }

    function setupObserver() {
        if (observer) observer.disconnect();
        
        let sentinel = document.getElementById('infinite-scroll-sentinel');
        if (!sentinel) {
            sentinel = document.createElement('div');
            sentinel.id = 'infinite-scroll-sentinel';
        }
        galleryContainer.appendChild(sentinel);

        observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !isLoading) {
                loadMoreItems();
            }
        }, { rootMargin: '800px' }); // Increased margin for smoother loading

        observer.observe(sentinel);
    }

    // --- Функции-помощники ---

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

    // --- Обработчики событий ---

    // Появление/скрытие кнопки "Наверх"
    window.addEventListener('scroll', () => {
        // Появление/скрытие кнопки "Наверх"
        if (window.scrollY > 300) {
            scrollToTopBtn.classList.add('visible');
        } else {
            scrollToTopBtn.classList.remove('visible');
        }
    });

    // Клик по кнопке "Наверх"
    scrollToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' }); // Плавная прокрутка наверх
    });

    tabGallery.addEventListener('click', () => {
        if (currentView === 'gallery') return;
        setActiveTab(tabGallery);
        currentView = 'gallery';
        renderView();
        updateSliderUI(); // Ensure fill is correct after potential tab reset

        if (searchInput.value) {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });

    tabFavorites.addEventListener('click', () => {
        if (currentView === 'favorites') return;
        setActiveTab(tabFavorites);
        currentView = 'favorites';
        startIndexOffset = 0;
        jumpInput.value = '';
        resetJumpState(false); 

        if (searchInput.value) {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        renderView();
        updateSliderUI();
    });

    function downloadFile(content, fileName, contentType) {
        const a = document.createElement('a');
        const file = new Blob([content], { type: contentType });
        a.href = URL.createObjectURL(file);
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    // --- Import / Export Overhaul ---
    const exportDataBtn = document.getElementById('export-favorites-btn');
    const importDataBtn = document.getElementById('import-favorites-btn');
    const importInput = document.getElementById('import-favorites-input');
    const saveTxtBtn = document.getElementById('save-favorites-txt-btn');

    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', () => {
            if (favorites.size === 0) return showToast('No favorites to export.');
            const data = Array.from(favorites.entries()).map(([id, meta]) => ({
                id,
                rating: meta.rating,
                timestamp: meta.timestamp
            }));
            downloadFile(JSON.stringify(data, null, 2), 'anima-styles-favorites.json', 'application/json');
            showToast('Favorites data exported!');
        });
    }

    if (saveTxtBtn) {
        saveTxtBtn.addEventListener('click', () => {
            if (favorites.size === 0) return showToast('No favorites to export.');
            const names = currentItems.map(item => item.artist).join('\n');
            downloadFile(names, 'favorite-artists.txt', 'text/plain');
            showToast('Artist names exported!');
        });
    }

    if (importDataBtn) importDataBtn.addEventListener('click', () => importInput.click());

    if (importInput) {
        importInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                const content = event.target.result;
                const isJson = file.name.toLowerCase().endsWith('.json');
                
                try {
                    const transaction = db.transaction(STORE_NAME, 'readwrite');
                    const store = transaction.objectStore(STORE_NAME);
                    let importCount = 0;

                    if (isJson) {
                        const importedData = JSON.parse(content);
                        if (!Array.isArray(importedData)) throw new Error('Invalid JSON format');
                        for (const item of importedData) {
                            if (item.id) {
                                store.put({
                                    id: item.id,
                                    timestamp: item.timestamp || Date.now(),
                                    rating: item.rating || 0
                                });
                                importCount++;
                            }
                        }
                    } else {
                        // Legacy .txt Import
                        const names = content.split('\n').map(n => n.trim()).filter(Boolean);
                        for (const name of names) {
                            // Find the ID for this artist name
                            const match = allItems.find(i => i.artist.toLowerCase() === name.toLowerCase());
                            if (match) {
                                store.put({
                                    id: match.id,
                                    timestamp: Date.now(),
                                    rating: 0
                                });
                                importCount++;
                            }
                        }
                    }

                    transaction.oncomplete = async () => {
                        await loadFavoritesFromDB();
                        renderView();
                        showToast(`Successfully imported ${importCount} favorites!`);
                    };
                } catch (err) {
                    console.error(err);
                    showToast('Error: Could not parse file.');
                }
            };
            reader.readAsText(file);
        });
    }

    // Обработка ввода в строке поиска
    searchInput.addEventListener('input', (e) => {
        const newSearchTerm = e.target.value.toLowerCase().trim();
        const isSearching = newSearchTerm.length > 0;
        clearSearchBtn.style.display = isSearching ? 'flex' : 'none';

        // Блокируем сортировку и переход, если есть поисковый запрос
        sortControls.classList.toggle('disabled', isSearching);
        jumpControls.classList.toggle('disabled', isSearching);

        // Если пользователь очистил поиск, сбрасываем смещение от "перехода"
        if (searchTerm.length > 0 && !isSearching) {
            startIndexOffset = 0;
        }

        searchTerm = newSearchTerm;
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
        if (e.key === 'Enter' && window.innerWidth <= 768) {
            e.target.blur();
        }
    });

    // --- Логика перехода к номеру ---
    function handleJump(isReset = false) {
        const targetWorksCount = parseInt(jumpInput.value, 10);
        if (isReset || !jumpInput.value) {
            resetJumpState();
            return;
        }

        const foundIndex = itemsSortedByWorks.findIndex(item => item.worksCount <= targetWorksCount);

        if (foundIndex === -1) {
            showToast('No artists found with that many works or less.');
            return;
        }

        // Блокируем другие контролы, ТОЛЬКО ЕСЛИ переход успешен
        if (foundIndex !== -1) {
            sortControls.classList.add('disabled');
            searchWrapper.classList.add('disabled');
            searchInput.disabled = true;
            searchInput.value = ''; // Очищаем поле поиска
            searchTerm = ''; // Сбрасываем поисковый запрос
        }
        // Устанавливаем смещение точно на найденный индекс, без запаса
        startIndexOffset = foundIndex;
        
        // Принудительно устанавливаем сортировку по работам (по убыванию)
        sortType = 'works';
        sortDirection = 'desc';
        

        renderView();
    }

    function resetJumpState(shouldRender = true) {
        startIndexOffset = 0;

        // Разблокируем контролы
        sortControls.classList.remove('disabled');
        searchWrapper.classList.remove('disabled');
        searchInput.disabled = false;

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
            if (window.innerWidth <= 768) {
                e.target.blur(); // Скрываем клавиатуру на мобильных
            }
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

        clearTimeout(jumpTimeout); // Сбрасываем таймер при каждом вводе
        jumpTimeout = setTimeout(() => handleJump(), 800); // Задержка 800мс
    });

    clearJumpBtn.addEventListener('click', () => resetJumpState());

    // --- Управление сортировкой ---
    function updateSortButtonsUI() {
        const isJumpActive = sortControls.classList.contains('disabled') && !searchTerm;
        const isSearching = searchTerm.length > 0;

        // Сброс состояния для всех кнопок
        [sortByNameBtn, sortByWorksBtn, sortByUniquenessBtn, sortByRatingBtn].forEach(btn => {
            if (btn) {
                btn.classList.remove('active');
                const arrow = btn.querySelector('.sort-arrow');
                if (arrow) arrow.textContent = '';
            }
        });

        // Блокируем сортировку и переход, если есть поисковый запрос
        sortControls.classList.toggle('disabled', isSearching || isJumpActive);
        jumpControls.classList.toggle('disabled', isSearching);

        // Блокируем поиск, если активен переход
        searchWrapper.classList.toggle('disabled', isJumpActive);
        searchInput.disabled = isJumpActive;


        let activeBtn;
        if (sortType === 'name') activeBtn = sortByNameBtn;
        else if (sortType === 'works') activeBtn = sortByWorksBtn;
        else if (sortType === 'uniqueness') activeBtn = sortByUniquenessBtn;
        else if (sortType === 'rating') activeBtn = sortByRatingBtn;

        if (activeBtn) {
            const arrow = activeBtn.querySelector('.sort-arrow');
            activeBtn.classList.add('active');
            if (arrow) arrow.textContent = sortDirection === 'asc' ? '▲' : '▼';
        }
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
    sortByUniquenessBtn.addEventListener('click', () => handleSortClick('uniqueness'));
    sortByRatingBtn.addEventListener('click', () => handleSortClick('rating'));

    function updateSliderUI() {
        if (!uniquenessMinSlider || !uniquenessMaxSlider) return;
        
        let min = parseInt(uniquenessMinSlider.value);
        let max = parseInt(uniquenessMaxSlider.value);
        
        if (min > max) {
            min = max;
            uniquenessMinSlider.value = min;
        }
        
        uniquenessMinFilter = min;
        uniquenessMaxFilter = max;
        
        uniquenessRangeText.textContent = `${min}% - ${max}%`;
        sliderTrackActive.style.left = min + '%';
        sliderTrackActive.style.width = (max - min) + '%';
    }

    uniquenessMinSlider.addEventListener('input', () => {
        updateSliderUI();
    });

    uniquenessMinSlider.addEventListener('change', () => {
        renderView();
    });

    uniquenessMaxSlider.addEventListener('input', () => {
        updateSliderUI();
    });

    uniquenessMaxSlider.addEventListener('change', () => {
        renderView();
    });

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
            updateSliderUI();
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
        const targetArtists = 8000;
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
