document.addEventListener('DOMContentLoaded', () => {
    // Получаем доступ к глобальным переменным из app.js
    // Убедитесь, что эти переменные доступны в глобальной области видимости в app.js
    const getGlobal = (name) => window.appGlobals?.[name];

    // --- DOM элементы ---
    const swipeOverlay = document.getElementById('swipe-mode-overlay');
    if (!swipeOverlay) return; // Если оверлея нет, ничего не делаем

    const swipeContainer = document.getElementById('swipe-container');
    const prevImage = document.getElementById('swipe-prev-image');
    const currentImage = document.getElementById('swipe-current-image');
    const nextImage = document.getElementById('swipe-next-image');
    const counterElement = document.getElementById('swipe-counter');
    const artistNameElement = document.getElementById('swipe-artist-name');
    const closeSwipeBtn = document.getElementById('swipe-close-btn');
    const likeFeedbackElement = document.getElementById('swipe-like-feedback');
    const startSwipeBtn = document.getElementById('start-swipe-mode-btn');
    const favoritesCountElement = document.getElementById('swipe-favorites-count');

    let currentIndex = -1;
    let activeList = [];
    let likeAnimationTimeout; // Переменная для хранения таймера анимации
    
    // --- Логика двунаправленной предзагрузки ---
    const PRELOAD_WINDOW = 15; // Сколько изображений грузить вперед и назад от текущего
    const PRELOAD_TRIGGER_OFFSET = 5; // За сколько изображений до края "окна" начинать новую загрузку
    let preloadedAheadIndex = -1; // Индекс, до которого предзагружено ВПЕРЕД
    let preloadedBehindIndex = -1; // Индекс, до которого предзагружено НАЗАД

    // --- Функции ---

    /**
     * Предзагружает следующую пачку изображений ВПЕРЕД.
     */
    function preloadAhead() {
        if (!activeList.length) return;
        const start = preloadedAheadIndex + 1;
        const end = Math.min(start + PRELOAD_WINDOW, activeList.length);
        for (let i = start; i < end; i++) {
            const img = new Image();
            img.src = activeList[i].image;
        }
        preloadedAheadIndex = end - 1;
    }

    /**
     * Предзагружает предыдущую пачку изображений НАЗАД.
     */
    function preloadBehind() {
        if (!activeList.length) return;
        const start = preloadedBehindIndex - 1;
        const end = Math.max(start - PRELOAD_WINDOW, -1);
        // Загружаем в обратном порядке, чтобы более близкие к текущему индексу грузились первыми
        for (let i = start; i > end; i--) {
            const img = new Image();
            img.src = activeList[i].image;
        }
        preloadedBehindIndex = end + 1;
    }

    /**
     * Открывает Swipe Mode для указанной карточки
     * @param {HTMLElement} cardElement - Карточка, на которую кликнули
     */
    function openSwipeMode(cardElement) {
        const currentView = getGlobal('currentView');
        // Дополнительная проверка, чтобы полностью блокировать запуск в "Избранном"
        if (currentView === 'favorites') {
            return;
        }

        const artistId = cardElement?.dataset.id; // cardElement может быть null
        const allCurrentItems = getGlobal('currentItems');
        const favorites = getGlobal('favorites');
        const showToast = getGlobal('showToast');

        // Фильтруем список, исключая уже добавленных в избранное
        activeList = allCurrentItems.filter(item => !favorites.has(item.id));

        // Если карточек для просмотра 1 или меньше, режим не имеет смысла
        if (activeList.length <= 1) {
            if (showToast) {
                if (allCurrentItems.length > 1 && activeList.length === 0) {
                    showToast('All visible artists are already in favorites!');
                } else {
                    showToast('Not enough cards to start swipe mode.');
                }
            }
            return;
        }

        if (artistId) {
            const isClickedCardFavorite = favorites.has(artistId);
            if (isClickedCardFavorite) {
                // Если кликнули на карточку, которая уже в избранном,
                // ищем следующую доступную карточку в общем списке.
                const originalClickedIndex = allCurrentItems.findIndex(item => item.id === artistId);
                let nextAvailableItem = null;
                for (let i = originalClickedIndex + 1; i < allCurrentItems.length; i++) {
                    if (!favorites.has(allCurrentItems[i].id)) {
                        nextAvailableItem = allCurrentItems[i];
                        break;
                    }
                }
                // Находим индекс этой следующей карточки в нашем отфильтрованном activeList.
                // Если не нашли (все последующие уже в избранном), начнем с начала (индекс 0).
                currentIndex = nextAvailableItem ? activeList.findIndex(item => item.id === nextAvailableItem.id) : 0;
            } else {
                // Если карточка не в избранном, просто находим ее индекс.
                currentIndex = activeList.findIndex(item => item.id === artistId);
            }
        } else {
            // Если cardElement не передан (клик по кнопке), начинаем с самого начала
            currentIndex = 0;
        }

        // Обновляем счетчик общего числа избранных при открытии
        if (favoritesCountElement) {
            favoritesCountElement.textContent = favorites ? favorites.size : 0;
        }
        document.body.style.overflow = 'hidden'; // Блокируем скролл основной страницы
        swipeOverlay.classList.add('visible');
        updateSwipeView();

        // Сбрасываем и запускаем двунаправленную предзагрузку
        preloadedAheadIndex = currentIndex - 1;
        preloadedBehindIndex = currentIndex + 1;
        preloadAhead();

        // Добавляем обработчики клавиатуры только когда режим активен
        document.addEventListener('keydown', handleSwipeKeyPress);
    }

    /**
     * Закрывает Swipe Mode
     */
    function closeSwipeMode() {
        swipeOverlay.classList.remove('visible');
        document.body.style.overflow = ''; // Возвращаем скролл
        const updateVisibleFavorites = getGlobal('updateVisibleFavorites');
        if (updateVisibleFavorites) {
            // Обновляем состояние сердечек на видимых карточках в основной галерее
            updateVisibleFavorites();
        }
        // Удаляем обработчики, чтобы не мешать основной навигации
        document.removeEventListener('keydown', handleSwipeKeyPress);
    }

    /**
     * Обновляет все элементы в оверлее на основе currentIndex
     */
    function updateSwipeView() {
        if (currentIndex < 0 || currentIndex >= activeList.length) return;

        const prevIndex = (currentIndex - 1 + activeList.length) % activeList.length;
        const nextIndex = (currentIndex + 1) % activeList.length;

        const currentItem = activeList[currentIndex];
        const prevItem = activeList[prevIndex];
        const nextItem = activeList[nextIndex];

        // Обновляем изображения
        currentImage.src = currentItem.image;
        prevImage.src = prevItem.image;
        nextImage.src = nextItem.image;

        // Обновляем счетчик и имя
        counterElement.textContent = `${currentIndex + 1} / ${activeList.length}`;
        artistNameElement.textContent = currentItem.artist;

        // Добавляем анимацию для плавной смены
        swipeContainer.classList.remove('swipe-transition');
        void swipeContainer.offsetWidth; // Трюк для сброса анимации
        swipeContainer.classList.add('swipe-transition');
    }

    /**
     * Переключает на следующее/предыдущее изображение
     * @param {number} direction - 1 для следующего, -1 для предыдущего
     */
    function navigate(direction) {
        if (!activeList.length) return;

        // Немедленно убираем анимацию лайка при навигации
        clearTimeout(likeAnimationTimeout);
        likeFeedbackElement.classList.remove('show');

        currentIndex = (currentIndex + direction + activeList.length) % activeList.length;
        updateSwipeView();

        // Проверяем, нужно ли подгрузить следующую пачку изображений
        if (direction > 0 && currentIndex + PRELOAD_TRIGGER_OFFSET >= preloadedAheadIndex) {
            preloadAhead();
        }
        // Проверяем, нужно ли подгрузить предыдущую пачку изображений
        // (учитываем цикличность списка)
        if (direction < 0 && (currentIndex - PRELOAD_TRIGGER_OFFSET <= preloadedBehindIndex || currentIndex > preloadedBehindIndex)) {
             preloadBehind();
        }
    }

    /**
     * Добавляет текущего артиста в избранное
     */
    function addToFavorites() {
        const db = getGlobal('db');
        const STORE_NAME = getGlobal('STORE_NAME');
        const favorites = getGlobal('favorites');
        const showToast = getGlobal('showToast');

        if (currentIndex === -1 || !db || !STORE_NAME || !favorites) return;

        const item = activeList[currentIndex];

        if (favorites.has(item.id)) {
            if (showToast) showToast('Already in favorites!');
            return;
        }

        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const favItem = { id: item.id, timestamp: Date.now() };
        store.put(favItem);

        transaction.oncomplete = () => {
            favorites.set(item.id, favItem.timestamp);
            if (showToast) showToast('Added to favorites');

            // Обновляем счетчик общего числа избранных
            if (favoritesCountElement) {
                favoritesCountElement.textContent = favorites.size;
            }
            // Добавляем визуальный фидбек (текст)
            artistNameElement.classList.add('favorited-feedback');
            setTimeout(() => artistNameElement.classList.remove('favorited-feedback'), 500);

            // Добавляем визуальный фидбек (сердце)
            clearTimeout(likeAnimationTimeout);
            likeFeedbackElement.classList.add('show');
            likeAnimationTimeout = setTimeout(() => likeFeedbackElement.classList.remove('show'), 600);
        };
    }

    /**
     * Обработчик нажатий клавиш в Swipe Mode
     * @param {KeyboardEvent} e
     */
    function handleSwipeKeyPress(e) {
        // Используем e.code для независимости от раскладки клавиатуры
        switch (e.code) {
            case 'ArrowLeft':
                navigate(-1);
                break;
            case 'ArrowRight':
                navigate(1);
                break;
            case 'KeyC': // Физическая клавиша 'C'
                if (artistNameElement.textContent) {
                    navigator.clipboard.writeText(artistNameElement.textContent).then(() => {
                        getGlobal('showToast')('Artist name copied!');
                        // Добавляем подсветку имени как фидбек
                        artistNameElement.classList.add('copied-feedback');
                        setTimeout(() => {
                            artistNameElement.classList.remove('copied-feedback');
                        }, 500);
                    });
                }
                break;
            case 'ArrowDown':
                addToFavorites();
                break;
            case 'Escape':
                closeSwipeMode();
                break;
        }
    }

    // --- Инициализация и глобальные привязки ---

    // Делегирование событий для клика колесиком мыши
    document.getElementById('gallery-container').addEventListener('mousedown', (e) => {
        // e.button === 1 это средняя кнопка мыши
        if (e.button === 1) {
            e.preventDefault(); 
            const card = e.target.closest('.card');
            if (!card) return;

            const currentView = getGlobal('currentView');
            const searchTerm = getGlobal('searchTerm');

            if (currentView === 'favorites') {
                // Новая логика: "Продолжить просмотр" из избранного
                const artistId = card.dataset.id;
                localStorage.setItem('continueSwipeFromId', artistId);
                // Программно кликаем на вкладку галереи
                document.getElementById('tab-gallery')?.click();
            } else if (currentView === 'gallery' && (!searchTerm || searchTerm.length === 0)) {
                // Старая логика: запуск Swipe Mode из галереи
                // (блокируем, если активен поиск по имени)
                if (card) {
                    openSwipeMode(card);
                }
            }
        }
    });

    // Запуск по клику на новую кнопку
    if (startSwipeBtn) {
        startSwipeBtn.addEventListener('click', () => openSwipeMode(null));
    }

    // Закрытие по клику на кнопку
    closeSwipeBtn.addEventListener('click', closeSwipeMode);

    // Закрытие по клику на фон
    swipeOverlay.addEventListener('click', (e) => {
        if (e.target === swipeOverlay) {
            closeSwipeMode();
        }
    });

    // Экспортируем функцию открытия, чтобы ее можно было вызвать из app.js (если понадобится)
    window.appSwipe = {
        open: openSwipeMode
    };
});