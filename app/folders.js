document.addEventListener('DOMContentLoaded', () => {
    const FOLDERS_STORE_NAME = 'folders';
    const FOLDER_ARTISTS_STORE_NAME = 'folder_artists';

    const foldersPanelWrapper = document.getElementById('folders-panel-wrapper');
    const foldersListContainer = document.getElementById('folders-list');
    const addFolderBtn = document.getElementById('add-folder-btn');
    const galleryContainer = document.getElementById('gallery-container');

    let folders = [];
    let folderArtists = new Map(); // Map<folderId, Array<{id: string, added: number}>>
    let allItemsMap = new Map(); // Map<artistId, artistData> for quick lookup
    let activeFolderId = 'unsorted'; // 'unsorted' by default
    let db;

    // --- Инициализация ---

    function initFolders() {
        db = window.appGlobals.db;
        if (!db) {
            console.error("Database not initialized in app.js");
            return;
        }
        
        // Populate allItemsMap from appGlobals.allItems
        if (window.appGlobals.allItems) {
            window.appGlobals.allItems.forEach(item => {
                allItemsMap.set(item.id, item);
            });
        }
        setupScrollListener();
        loadDataAndRender();
    }

    async function loadDataAndRender() {
        await loadFolders();
        await loadFolderArtists();
        renderFolders();
    }

    // --- Загрузка данных из IndexedDB ---

    function loadFolders() {
        return new Promise(resolve => {
            const transaction = db.transaction(FOLDERS_STORE_NAME, 'readonly');
            const store = transaction.objectStore(FOLDERS_STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                folders = request.result.sort((a, b) => a.name.localeCompare(b.name));
                resolve();
            };
        });
    }

    function loadFolderArtists() {
        return new Promise(resolve => {
            folderArtists.clear();
            const transaction = db.transaction(FOLDER_ARTISTS_STORE_NAME, 'readonly');
            const store = transaction.objectStore(FOLDER_ARTISTS_STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                request.result.forEach(item => {
                    folderArtists.set(item.folderId, item.artistIds); // Загружаем как массив
                });
                resolve();
            };
        });
    }

    // --- Отрисовка ---

    function renderFolders() {
        if (!foldersListContainer) return;
        foldersListContainer.innerHTML = '';

        // 1. Создаем и добавляем папку "Неотсортированное"
        const unsortedFolderEl = createUnsortedFolderElement();
        foldersListContainer.appendChild(unsortedFolderEl);

        // 2. Отрисовываем папки, созданные пользователем
        folders.forEach(folder => {
            const folderEl = createFolderElement(folder);
            if (folder.id === activeFolderId) folderEl.classList.add('active');
            foldersListContainer.appendChild(folderEl);
        });

        // 3. Перемещаем кнопку "Add Folder" в конец сетки
        if (addFolderBtn) {
            foldersListContainer.appendChild(addFolderBtn);
        }

        // Поведение скролла теперь управляется постоянным слушателем событий
    }

    /**
     * Устанавливает слушатель событий 'wheel' для контейнера папок,
     * чтобы предотвратить прокрутку основной страницы, пока прокручивается сам контейнер.
     */
    function setupScrollListener() {
        foldersListContainer.addEventListener('wheel', (e) => {
            const el = foldersListContainer;
            const { deltaY } = e;
            const { scrollTop, scrollHeight, clientHeight } = el;

            // Проверяем, есть ли вообще прокрутка в элементе
            if (scrollHeight <= clientHeight) {
                // Если прокрутки нет, ничего не делаем, событие всплывет и прокрутит страницу
                return;
            }

            // Если крутим вниз (deltaY > 0)
            if (deltaY > 0) {
                // Если мы еще не достигли самого низа
                if (scrollTop < scrollHeight - clientHeight) {
                    e.preventDefault(); // Блокируем прокрутку страницы
                    el.scrollTop += deltaY; // и прокручиваем панель вручную
                }
            } else { // Если крутим вверх (deltaY < 0)
                // Если мы еще не на самом верху
                if (scrollTop > 0) {
                    e.preventDefault(); // Блокируем прокрутку страницы
                    el.scrollTop += deltaY; // и прокручиваем панель вручную
                }
            }
        }, { passive: false }); // passive: false необходимо для работы preventDefault()
    }

    function getUnsortedArtistIds() {
        const favorites = window.appGlobals.favorites;
        if (!favorites) return new Set();

        // 1. Собираем ID всех артистов, которые уже лежат в папках
        const allCategorizedArtists = new Set();
        for (const artistIdArray of folderArtists.values()) {
            artistIdArray.forEach(item => allCategorizedArtists.add(item.id));
        }

        // 2. Находим ID артистов, которые есть в избранном, но не в папках
        const favoriteArtistIds = Array.from(favorites.keys());
        return new Set(favoriteArtistIds.filter(id => !allCategorizedArtists.has(id)));
    }

    /**
     * Создает элемент для виртуальной папки "Неотсортированное".
     */
    function createUnsortedFolderElement() {
        const favorites = window.appGlobals.favorites;
        const unsortedArtistIdsSet = getUnsortedArtistIds();
        const unsortedArtistIds = Array.from(unsortedArtistIdsSet);

        // 3. Сортируем ID по времени добавления в избранное (новые первыми)
        unsortedArtistIds.sort((a, b) => favorites.get(b) - favorites.get(a));

        const unsortedCount = unsortedArtistIds.length;
        let lastUnsortedArtistImage = null;

        // 4. Находим изображение для миниатюры (самый новый несортированный артист)
        if (unsortedArtistIds.length > 0) {
            const lastUnsortedArtistId = unsortedArtistIds[0];
            const artistData = allItemsMap.get(lastUnsortedArtistId);
            if (artistData) {
                lastUnsortedArtistImage = artistData.image;
            }
        }

        // 5. Создаем DOM-элемент
        const item = document.createElement('div');
        item.className = 'folder-item folder-item--unsorted'; // Добавляем специальный класс
        item.dataset.folderId = 'unsorted'; // Специальный ID
        if (activeFolderId === 'unsorted') {
            item.classList.add('active');
        }

        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'folder-item-thumbnail-container';

        if (lastUnsortedArtistImage) {
            thumbnailContainer.style.backgroundImage = `url('${lastUnsortedArtistImage}')`;
            const thumbnailImg = document.createElement('img');
            thumbnailImg.src = lastUnsortedArtistImage;
            thumbnailImg.alt = 'Unsorted';
            thumbnailImg.className = 'folder-item-thumbnail';
            thumbnailImg.loading = 'lazy';
            thumbnailContainer.appendChild(thumbnailImg);
        }

        item.innerHTML = `
            <span class="folder-name">Unsorted</span>
            <span class="folder-count">${unsortedCount}</span>
        `;
        item.appendChild(thumbnailContainer);

        // Создаем кнопку "очистки" для Неотсортированной папки
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'folder-delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.title = 'Clear all unsorted favorites';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleClearUnsortedFolder();
        });
        item.insertBefore(deleteBtn, item.firstChild);

        // Обработчик клика для фильтрации
        item.addEventListener('click', () => {
            setActiveFolder('unsorted');
        });


        // Эта папка не должна быть переименовываемой, поэтому dblclick не добавляем.
        // Но она должна принимать перетаскиваемые карточки (хотя это бессмысленно, т.к. они и так там)
        // Оставим логику drop для консистентности, но она ничего не будет делать.
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            item.classList.add('drag-over');
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');
            // Карточки уже в "Неотсортированном", если они не в других папках.
            // Можно показать уведомление.
            window.appGlobals.showToast('This artist is already in Unsorted.');
        });

        return item;
    }

    function createFolderElement(folder) {
        const item = document.createElement('div');
        item.className = 'folder-item';
        item.dataset.folderId = folder.id;

        const artistCount = (folderArtists.get(folder.id) || []).length;

        // Основной контейнер, который будет содержать все элементы
        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'folder-item-thumbnail-container';

        if (folder.lastArtistId) {
            const lastArtistData = allItemsMap.get(folder.lastArtistId);
            const lastArtistImage = lastArtistData?.image;

            // Устанавливаем изображение как фон для контейнера
            thumbnailContainer.style.backgroundImage = `url('${lastArtistImage}')`;
            const thumbnailImg = document.createElement('img');
            thumbnailImg.src = lastArtistImage;
            thumbnailImg.alt = folder.name;
            thumbnailImg.className = 'folder-item-thumbnail';
            thumbnailImg.loading = 'lazy';
            thumbnailContainer.appendChild(thumbnailImg);
        }
        // Создаем кнопку удаления
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'folder-delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.title = 'Delete folder';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Останавливаем всплытие, чтобы не сработал клик по папке
            handleDeleteFolder(folder.id, folder.name, artistCount);
        });

        item.innerHTML = `
            <span class="folder-name">${folder.name}</span>
            <span class="folder-count">${artistCount}</span>
        `;
        item.appendChild(thumbnailContainer);
        // Добавляем кнопку удаления в DOM
        item.insertBefore(deleteBtn, item.firstChild);
        
        // Обработчик клика для фильтрации
        item.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') setActiveFolder(folder.id);
        });

        // Переименование по двойному клику
        item.addEventListener('dblclick', (e) => {
            // Предотвращаем срабатывание, если кликнули на инпут
            if (e.target.tagName === 'INPUT') return;

            // Добавляем класс для режима переименования
            item.classList.add('is-renaming');

            const folderNameEl = item.querySelector('.folder-name');
            const oldName = folder.name;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = oldName;
            input.className = 'search-input'; // Используем существующий стиль
            // Стили для инпута, чтобы он выглядел как элемент папки
            input.style.position = 'absolute';
            input.style.bottom = '8px';
            input.style.left = '8px';
            input.style.right = '8px';
            input.style.width = 'calc(100% - 16px)';
            input.style.padding = '0';
            input.style.background = 'transparent';
            input.style.border = 'none';
            input.style.color = '#fff';
            input.style.zIndex = '3';
            item.appendChild(input);
            input.focus();

            const saveName = () => {
                const newName = input.value.trim();
                if (newName && newName !== oldName) {
                    folder.name = newName;
                    const transaction = db.transaction(FOLDERS_STORE_NAME, 'readwrite');
                    transaction.objectStore(FOLDERS_STORE_NAME).put(folder);                    
                    folderNameEl.textContent = newName;
                } else {
                    folderNameEl.textContent = oldName; // Возвращаем старое имя, если ввод пустой
                }
                input.remove();
                // Убираем класс после сохранения
                item.classList.remove('is-renaming');
            };

            input.addEventListener('blur', saveName);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    input.blur();
                } else if (e.key === 'Escape') {
                    input.value = oldName;
                    input.blur();
                }
            });
        });

        // Drag and Drop
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            item.classList.add('drag-over');
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over'); 
            const data = e.dataTransfer.getData('application/json');
            addArtistToFolder(folder.id, data);
        });

        return item;
    }

    function setActiveFolder(folderId, shouldRender = true) {
        if (activeFolderId === folderId && shouldRender) return; // Не делаем ничего, если папка уже активна

        activeFolderId = folderId;

        // Обновляем классы
        const allFolderItems = foldersListContainer.querySelectorAll('.folder-item');
        allFolderItems.forEach(item => {
            item.classList.toggle('active', item.dataset.folderId === folderId);
        });

        // Вызываем перерисовку галереи в app.js
        if (shouldRender && window.appGlobals && window.appGlobals.renderView) {
            window.appGlobals.renderView();
            // renderView() автоматически сбросит выделение
        }
    }

    function handleDeleteFolder(folderId, folderName, artistCount) {
        let confirmationMessage = `Are you sure you want to delete the folder "${folderName}"?`;
        if (artistCount > 0) {
            confirmationMessage = `The folder "${folderName}" contains ${artistCount} artist(s).\n\nIf you delete it, these artists will also be REMOVED FROM FAVORITES.\n\nAre you sure you want to proceed?`;
        } 

        if (window.confirm(confirmationMessage)) {
            deleteFolder(folderId);
        }
    }

    /**
     * Обрабатывает запрос на очистку папки "Неотсортированное".
     */
    function handleClearUnsortedFolder() {
        const artistIdsToDelete = getUnsortedArtistIds();
        if (artistIdsToDelete.size === 0) {
            window.appGlobals.showToast("Unsorted folder is already empty.");
            return;
        }

        const confirmationMessage = `Are you sure you want to remove all ${artistIdsToDelete.size} unsorted artist(s) from your favorites? This action cannot be undone.`;

        if (window.confirm(confirmationMessage)) {
            const tx = db.transaction(window.appGlobals.STORE_NAME, 'readwrite');
            const favoritesStore = tx.objectStore(window.appGlobals.STORE_NAME);

            artistIdsToDelete.forEach(artistId => favoritesStore.delete(artistId));

            tx.oncomplete = () => {
                artistIdsToDelete.forEach(artistId => window.appGlobals.favorites.delete(artistId));
                window.appGlobals.showToast(`${artistIdsToDelete.size} unsorted artist(s) removed from favorites.`);
                
                // Перерисовываем обе панели для полной синхронизации
                renderFolders();
                window.appGlobals.renderView();
            };

            tx.onerror = (event) => {
                window.appGlobals.showToast('Error clearing unsorted favorites.');
                console.error("Error clearing unsorted favorites:", event.target.error);
            };
        }
    }

    function deleteFolder(folderId) {
        const artistIdsToDelete = (folderArtists.get(folderId) || []).map(item => item.id);

        // 1. Удаляем из массивов в памяти
        folders = folders.filter(f => f.id !== folderId);

        // 2. Используем одну транзакцию для удаления из всех трех таблиц
        const tx = db.transaction([FOLDERS_STORE_NAME, FOLDER_ARTISTS_STORE_NAME, window.appGlobals.STORE_NAME], 'readwrite');
        const folderStore = tx.objectStore(FOLDERS_STORE_NAME);
        const folderArtistStore = tx.objectStore(FOLDER_ARTISTS_STORE_NAME);
        const favoritesStore = tx.objectStore(window.appGlobals.STORE_NAME);

        // Удаляем саму папку
        folderStore.delete(folderId);
        // Удаляем связь папки с артистами
        folderArtistStore.delete(folderId);
        // Удаляем артистов из этой папки из общего списка избранных
        artistIdsToDelete.forEach(artistId => {
            favoritesStore.delete(artistId);
        });

        tx.oncomplete = () => {
            // Обновляем данные в памяти после успешной транзакции
            folderArtists.delete(folderId);
            artistIdsToDelete.forEach(artistId => {
                window.appGlobals.favorites.delete(artistId);
            });

            window.appGlobals.showToast(`Folder "${getFolderName(folderId, true)}" and ${artistIdsToDelete.length} artist(s) deleted.`);

            // 3. Если удаленная папка была активной, переключаемся на "Неотсортированное".
            if (activeFolderId === folderId) {
                setActiveFolder('unsorted'); // Этот вызов также перерисует галерею
            } else {
                renderFolders(); // Перерисовываем панель папок
            }
        };
        tx.onerror = (event) => {
            window.appGlobals.showToast('Error deleting folder.');
            console.error("Error deleting folder transaction:", event.target.error);
        };
    }

    // --- CRUD операции ---

    function createNewFolder() {
        const name = prompt("Enter new folder name:", "New Folder");
        if (name) {
            const newFolder = {
                id: `folder-${Date.now()}`,
                name: name.trim(),
                lastArtistId: null // Поле для ID последнего добавленного артиста
            };
            folders.push(newFolder);
            folders.sort((a, b) => a.name.localeCompare(b.name)); // Поддерживаем сортировку

            const transaction = db.transaction(FOLDERS_STORE_NAME, 'readwrite');
            transaction.objectStore(FOLDERS_STORE_NAME).add(newFolder);
            transaction.oncomplete = () => {
                renderFolders();
            };
        }
    }

    function removeArtistFromPreviousFolder(artistId) {
        let sourceFolderId = null;
        let sourceFolderData = null;
        // Ищем, в какой папке находится артист
        for (const [folderId, artistIdArray] of folderArtists.entries()) {
            const artistIndex = artistIdArray.findIndex(item => item.id === artistId);
            if (artistIndex !== -1) {
                artistIdArray.splice(artistIndex, 1); // Удаляем артиста из массива
                sourceFolderId = folderId;

                // Обновляем данные в IndexedDB для исходной папки
                const transaction = db.transaction(FOLDER_ARTISTS_STORE_NAME, 'readwrite');
                const store = transaction.objectStore(FOLDER_ARTISTS_STORE_NAME);
                if (artistIdArray.length > 0) {
                    store.put({ folderId, artistIds: artistIdArray });
                    transaction.oncomplete = () => {
                        // После успешного обновления данных в БД, перерисовываем панель
                        // чтобы обновить счетчик и, возможно, миниатюру.
                        renderFolders();
                    };
                } else {
                    store.delete(folderId); // Удаляем запись, если папка стала пустой
                }

                // Находим данные папки для обновления миниатюры
                sourceFolderData = folders.find(f => f.id === folderId);
                break;
            }
        }

        // Если папка-источник была найдена и это не "Unsorted"
        if (sourceFolderData) {
            // Обновляем ее миниатюру, так как последний добавленный художник мог быть удален
            const artistIdArrayForSource = folderArtists.get(sourceFolderData.id);
            if (artistIdArrayForSource) {
                if (artistIdArrayForSource.length > 0) {
                    // Находим ID последнего добавленного артиста для обновления миниатюры
                    const lastArtistId = artistIdArrayForSource.sort((a, b) => b.added - a.added)[0].id;
                    updateFolderThumbnail(sourceFolderData.id, lastArtistId);
                } else {
                    // Если папка стала пустой, убираем миниатюру
                    updateFolderThumbnail(sourceFolderData.id, null);
                }
            }
        }
        return sourceFolderId;
    }
    function addArtistToFolder(folderId, data) {
        let artistIds;
        try {
            // Пытаемся распарсить как массив (мульти-выделение)
            const parsedData = JSON.parse(data);
            if (Array.isArray(parsedData)) {
                artistIds = parsedData;
            } else {
                // Обратная совместимость, если передали не JSON-массив
                artistIds = [String(data)];
            }
        } catch (e) {
            // Если не JSON, считаем, что это одиночный ID
            artistIds = [String(data)];
        }

        // Фильтруем ID, чтобы перемещать только тех, кто еще не в этой папке
        const artistsToMove = artistIds.filter(id => 
            !folderArtists.get(folderId)?.some(item => item.id === id)
        );

        if (artistsToMove.length === 0) {
            window.appGlobals.showToast('Artist(s) are already in this folder.');
            return;
        }

        const destinationFolderData = folders.find(f => f.id === folderId);
        const lastArtistId = artistsToMove[artistsToMove.length - 1]; // Последний для миниатюры

        // Используем одну транзакцию для всех операций
        const tx = db.transaction([FOLDER_ARTISTS_STORE_NAME, FOLDERS_STORE_NAME], 'readwrite');
        const folderArtistsStore = tx.objectStore(FOLDER_ARTISTS_STORE_NAME);
        const foldersStore = tx.objectStore(FOLDERS_STORE_NAME);

        // Удаляем художников из их предыдущих папок
        artistsToMove.forEach(id => removeArtistFromPreviousFolder(id));

        // Добавляем художников в новую папку
        const targetFolderList = folderArtists.get(folderId) || [];
        artistsToMove.forEach(id => {
            targetFolderList.push({ id, added: Date.now() });
        });
        folderArtists.set(folderId, targetFolderList);
        folderArtistsStore.put({ folderId, artistIds: targetFolderList });

        // Обновляем миниатюру целевой папки
        if (destinationFolderData) {
            destinationFolderData.lastArtistId = lastArtistId;
            foldersStore.put(destinationFolderData);
        }

        tx.oncomplete = () => {
            // После успешной транзакции обновляем UI
            renderFolders(); // Перерисовываем панель папок

            // Плавно удаляем карточки из галереи
            artistsToMove.forEach(id => {
                const cardToRemove = galleryContainer.querySelector(`.card[data-id="${id}"]`);
                if (cardToRemove) {
                    cardToRemove.style.transition = 'opacity 0.3s ease, transform 0.3s ease, max-height 0.3s ease 0.1s, margin 0.3s ease 0.1s, padding 0.3s ease 0.1s';
                    cardToRemove.style.opacity = '0';
                    cardToRemove.style.transform = 'scale(0.9)';
                    cardToRemove.style.maxHeight = '0px';
                    cardToRemove.style.margin = '0';
                    cardToRemove.style.padding = '0';
                    cardToRemove.addEventListener('transitionend', () => cardToRemove.remove(), { once: true });
                }
            });

            // Показываем одно уведомление для всей группы
            if (destinationFolderData) {
                const message = artistsToMove.length > 1
                    ? `${artistsToMove.length} artists moved to "${destinationFolderData.name}"`
                    : `Moved to "${destinationFolderData.name}"`;
                window.appGlobals.showToast(message);
            }

            // Очищаем выделение после успешного перемещения
            window.appGlobals.clearSelection();
        };
    }

    function updateFolderThumbnail(folderId, artistId, onCompleteCallback) {
        const transaction = db.transaction(FOLDERS_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(FOLDERS_STORE_NAME);
        store.get(folderId).onsuccess = (event) => {
            const folderToUpdate = event.target.result;
            if (folderToUpdate) {
                folderToUpdate.lastArtistId = String(artistId);
                store.put(folderToUpdate);
                // Обновляем данные в локальном массиве для немедленной перерисовки
                const localFolder = folders.find(f => f.id === folderId);
                if (localFolder) {
                    localFolder.lastArtistId = artistId;
                }
            }
        };
        if (onCompleteCallback) {
            transaction.oncomplete = onCompleteCallback;
        }
    }

    // --- Обработчики событий ---

    if (addFolderBtn) {
        addFolderBtn.addEventListener('click', createNewFolder);
    }

    // Делегирование событий для dragstart на карточках
    galleryContainer.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.card');
        if (!card || window.appGlobals.currentView !== 'favorites') return;

        const selectedIds = window.appGlobals.selectedArtistIds;
        const draggedId = card.dataset.id;

        // Если перетаскиваемая карточка входит в группу выделенных,
        // передаем всю группу.
        if (selectedIds.has(draggedId)) {
            e.dataTransfer.setData('application/json', JSON.stringify(Array.from(selectedIds)));
        } else {
            // Иначе, это одиночное перетаскивание. Очищаем выделение и передаем один ID.
            window.appGlobals.clearSelection();
            document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
            e.dataTransfer.setData('application/json', JSON.stringify([draggedId]));
        }

        e.dataTransfer.effectAllowed = 'move';
    });

    /**
     * Gets the name of a folder by its ID.
     * @param {string} folderId The ID of the folder.
     * @param {object} [options] Optional parameters.
     * @param {boolean} [options.returnOldNameAfterDeletion=false] If true, returns a placeholder name if the folder was just deleted from memory but the name is needed for a toast message.
     * @returns {string} The name of the folder or an empty string.
     */
    function getFolderName(folderId, { returnOldNameAfterDeletion = false } = {}) {
        if (folderId === 'unsorted') {
            return 'Unsorted';
        }
        const folder = folders.find(f => f.id === folderId);
        return folder ? folder.name : '';
    }

    /**
     * Обрабатывает удаление артиста из избранного.
     * Вызывается из app.js для синхронизации состояния папок.
     * @param {string} artistId ID удаленного из избранного артиста.
     */
    function handleFavoriteRemoval(artistId) {
        removeArtistFromPreviousFolder(artistId);
        renderFolders(); // Всегда перерисовываем панель для обновления папки "Unsorted"
    }

    // --- Экспорт для app.js ---
    window.appFolders = {
        init: initFolders,
        showPanel: () => { 
            if (foldersPanelWrapper && window.innerWidth > 992) {
                foldersPanelWrapper.style.display = 'block'; 
            }
        },
        hidePanel: () => { if(foldersPanelWrapper) foldersPanelWrapper.style.display = 'none'; },
        get activeFolderId() { return activeFolderId; },
        setActiveFolder: setActiveFolder,
        getArtistIdsInFolder: (folderId) => {
            const items = folderArtists.get(folderId) || [];
            return items.sort((a, b) => b.added - a.added).map(item => item.id);
        },
        getUnsortedArtistIds: getUnsortedArtistIds,
        getFolderName: (folderId, returnOldName) => getFolderName(folderId, { returnOldNameAfterDeletion: returnOldName }),
        handleFavoriteRemoval: handleFavoriteRemoval,
        get folders() { return folders; }, // Экспортируем массив папок
        get folderArtists() { return folderArtists; }, // Экспортируем Map связей
        loadData: loadDataAndRender // Экспортируем функцию для перезагрузки данных
    };
});