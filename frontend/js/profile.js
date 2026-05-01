let currentUser = null;
let activeChatId = null;

function ensureModal(id, title = '') {
    let modalElement = document.getElementById(id);
    if (!modalElement) {
        modalElement = document.createElement('div');
        modalElement.className = 'modal fade';
        modalElement.id = id;
        modalElement.tabIndex = -1;
        modalElement.innerHTML = `
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">${title}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body"></div>
            </div>
          </div>
        `;
        document.body.appendChild(modalElement);
    }
    return modalElement;
}

function showModal(id, title, bodyHtml) {
    const modalElement = ensureModal(id, title);
    const titleEl = modalElement.querySelector('.modal-title');
    const bodyEl = modalElement.querySelector('.modal-body');
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = bodyHtml;
    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
    modal.show();
}

async function showUserCard(userId) {
    try {
        const user = await usersAPI.getById(userId);
        if (!user) {
            showModal('profileUserModal', 'Пользователь', '<p class="text-muted">Пользователь не найден.</p>');
            return;
        }
        const reviews = await reviewsAPI.getByUser(userId);
        const avg = reviews.length
            ? (reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length).toFixed(1)
            : '—';
        showModal(
            'profileUserModal',
            'Карточка пользователя',
            `
              <p><strong>Имя:</strong> ${user.name || 'Не указано'}</p>
              <p><strong>Email:</strong> ${user.email || 'Не указано'}</p>
              <p><strong>Тип:</strong> ${user.type || 'Не указано'}</p>
              <p><strong>Отзывы:</strong> ${reviews.length} (ср. оценка ${avg})</p>
            `
        );
    } catch (error) {
        console.error('Error loading user card:', error);
        showModal('profileUserModal', 'Пользователь', '<div class="alert alert-danger">Ошибка загрузки карточки</div>');
    }
}

function parseProfileQuery() {
    const params = new URLSearchParams(window.location.search);
    return {
        chatId: params.get('chatId'),
        tab: (params.get('tab') || '').trim().toLowerCase(),
    };
}

function profileHtmlLeaf(pathname) {
    const p = String(pathname || '').replace(/\/+$/, '');
    const seg = (p.split('/').pop() || '').toLowerCase();
    if (seg === 'profile') return 'profile.html';
    return seg;
}

function setSidebarActiveTab(tabLabel) {
    document.querySelectorAll('.list-group-item').forEach((item) => {
        const label = item.textContent.trim();
        if (label === tabLabel) item.classList.add('active');
        else item.classList.remove('active');
    });
}

async function bootstrapProfile() {
    currentUser = await authAPI.getCurrentUser();
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }
    await initNavbar(currentUser);
    const path = window.location.pathname || '';
    const search = window.location.search || '';
    const leaf = profileHtmlLeaf(path);
    if (currentUser.type === 'landlord' && leaf === 'profile.html') {
        window.location.href = '/profile_landlord' + search;
        return;
    }
    if (currentUser.type !== 'landlord' && leaf === 'profile_landlord.html') {
        window.location.href = '/profile' + search;
        return;
    }
    const q = parseProfileQuery();
    const openMessages = q.tab === 'messages' && currentUser.type === 'tenant';
    await switchToTab(openMessages ? 'Сообщения' : 'Профиль');
}

async function switchToTab(tabName) {
    const profileContent = document.querySelector('.col-md-9');
    if (!profileContent) return;
    const sidebarLabels = ['Профиль', 'Мои аренды', 'Сообщения', 'Мои объявления'];
    if (sidebarLabels.includes(tabName)) setSidebarActiveTab(tabName);
    if (tabName === 'Профиль') {
        profileContent.innerHTML = `<div id="profileOverview"></div>`;
        await renderProfileOverview();
    } else if (tabName === 'Мои аренды') {
        profileContent.innerHTML = `<h5>Активные бронирования</h5><div id="rentalsList"></div>`;
        await loadBookings(currentUser.id);
    } else if (tabName === 'Мои объявления' && currentUser.type === 'landlord') {
        profileContent.innerHTML = `<div id="landlordListingsPanel"></div>`;
        await renderLandlordListingsPanel();
    } else if (tabName === 'Сообщения') {
        if (currentUser.type !== 'tenant') {
            profileContent.innerHTML = `<h5>Сообщения</h5><p class="text-muted">Переписка доступна только арендаторам.</p>`;
            return;
        }
        profileContent.innerHTML = `
          <div class="row">
            <div class="col-md-4">
              <h5>Мои чаты</h5>
              <div id="chatsList" class="list-group"></div>
            </div>
            <div class="col-md-8">
              <div id="chatHeader" class="mb-2 text-muted">Выберите чат</div>
              <div id="chatMessages" class="border rounded p-2 mb-2" style="height:300px;overflow:auto;"></div>
              <form id="chatSendForm" class="d-flex gap-2">
                <input id="chatTextInput" class="form-control" placeholder="Введите сообщение..." />
                <button class="btn btn-primary" type="submit">Отправить</button>
              </form>
            </div>
          </div>
        `;
        await loadChats();
    } else {
        profileContent.innerHTML = `<h5>${tabName}</h5><p class="text-muted">Раздел в разработке.</p>`;
    }
}

async function renderProfileOverview() {
    const container = document.getElementById('profileOverview');
    if (!container) return;
    container.innerHTML = `
      <h3>Привет, <span id="usernameDisplay">${currentUser.email || currentUser.name}</span></h3>
      <p>Краткая информация: ${currentUser.email || ''}</p>
      <div class="my-3"><a href="index.html" class="btn btn-secondary">На главную</a></div>
    `;
}

async function renderLandlordListingsPanel() {
    const container = document.getElementById('landlordListingsPanel');
    if (!container || !currentUser || currentUser.type !== 'landlord') return;

    const allListings = await listingsAPI.getAll();
    const activeOffers = allListings.filter((listing) => listing.ownerId === currentUser.id);

    const offersHtml = activeOffers.length
        ? activeOffers
              .map(
                  (listing) => `
                    <div class="card mb-2"><div class="card-body">
                        <strong>${listing.title || 'Объявление'}</strong><br/>
                        ${Number(listing.price || 0).toLocaleString('ru-RU')} ₽ / мес
                        <div class="text-muted small mt-1">Фото: ${(listing.photos || []).length}</div>
                        <button class="btn btn-outline-primary btn-sm mt-2 edit-listing-btn" data-listing-id="${listing.id}">
                          Редактировать
                        </button>
                    </div></div>
                  `
              )
              .join('')
        : '<p class="text-muted">Объявлений пока нет.</p>';

    container.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h4 class="mb-0">Мои объявления</h4>
        <button class="btn btn-primary btn-sm" id="addListingBtn">Добавить объявление</button>
      </div>
      <div id="landlordListingsList">${offersHtml}</div>
    `;

    const addBtn = document.getElementById('addListingBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => openCreateListingModal());
    }

    document.querySelectorAll('.edit-listing-btn').forEach((button) => {
        button.addEventListener('click', () => {
            const listingId = button.getAttribute('data-listing-id');
            const listing = activeOffers.find((item) => item.id === listingId);
            if (!listing) return;
            openEditListingModal(listing);
        });
    });
}

async function refreshLandlordListingUIs() {
    if (currentUser?.type === 'landlord') {
        if (document.getElementById('landlordListingsPanel')) {
            await renderLandlordListingsPanel();
        }
        if (document.getElementById('profileOverview')) {
            await renderProfileOverview();
        }
    } else {
        await renderProfileOverview();
    }
}

const LISTING_ESTATE_TYPES = [
    { id: 1, slug: 'apartment', label: 'Квартира' },
    { id: 2, slug: 'house', label: 'Дом' },
    { id: 3, slug: 'studio', label: 'Студия' },
];

function listingEstateTypeSelectHtml(selectId, selectedTypeId) {
    const selected = Number(selectedTypeId) || 1;
    const options = LISTING_ESTATE_TYPES.map(
        (t) => `<option value="${t.id}"${t.id === selected ? ' selected' : ''}>${t.label}</option>`
    ).join('');
    return `
      <div class="mb-2">
        <label class="form-label" for="${selectId}">Тип недвижимости</label>
        <select id="${selectId}" class="form-select" required>
          ${options}
        </select>
      </div>
    `;
}

function resolveListingTypeId(listing) {
    const slug = listing?.type;
    if (slug === 'apartment' || slug === 'house' || slug === 'studio') {
        return LISTING_ESTATE_TYPES.find((t) => t.slug === slug)?.id ?? 1;
    }
    if (slug === 'Квартира') return 1;
    if (slug === 'Дом') return 2;
    if (slug === 'Комната' || slug === 'Студия') return 3;
    return 1;
}

function openCreateListingModal() {
    showModal(
        'createListingModal',
        'Добавить объявление',
        `
          <form id="createListingForm">
            <div class="mb-2">
              <label class="form-label">Название</label>
              <input id="listingTitle" class="form-control" required />
            </div>
            ${listingEstateTypeSelectHtml('listingTypeId', 1)}
            <div class="mb-2">
              <label class="form-label">Цена (₽ / мес)</label>
              <input id="listingPrice" type="number" min="1" class="form-control" required />
            </div>
            <div class="mb-2">
              <label class="form-label">Локация</label>
              <input id="listingLocation" class="form-control" />
            </div>
            <div class="mb-2">
              <label class="form-label">Описание</label>
              <textarea id="listingDescription" class="form-control" rows="3"></textarea>
            </div>
            <div class="mb-2">
              <label class="form-label">Фотографии</label>
              <input id="listingPhotos" type="file" class="form-control" accept="image/*" multiple />
            </div>
            <button type="submit" class="btn btn-success w-100">Создать</button>
          </form>
        `
    );

    const form = document.getElementById('createListingForm');
    if (form) {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            await handleCreateListing();
        });
    }
}

function openEditListingModal(listing) {
    showModal(
        'editListingModal',
        'Редактировать объявление',
        `
          <form id="editListingForm">
            <div class="mb-2">
              <label class="form-label">Название</label>
              <input id="editListingTitle" class="form-control" required value="${escapeHtml(listing.title || '')}" />
            </div>
            ${listingEstateTypeSelectHtml('editListingTypeId', resolveListingTypeId(listing))}
            <div class="mb-2">
              <label class="form-label">Цена (₽ / мес)</label>
              <input id="editListingPrice" type="number" min="1" class="form-control" required value="${Number(
                  listing.price || 0
              )}" />
            </div>
            <div class="mb-2">
              <label class="form-label">Локация</label>
              <input id="editListingLocation" class="form-control" value="${escapeHtml(listing.location || '')}" />
            </div>
            <div class="mb-2">
              <label class="form-label">Описание</label>
              <textarea id="editListingDescription" class="form-control" rows="3">${escapeHtml(
                  listing.description || ''
              )}</textarea>
            </div>
            <div class="mb-2">
              <label class="form-label">Добавить фотографии</label>
              <input id="editListingPhotos" type="file" class="form-control" accept="image/*" multiple />
              <div class="form-text">Текущие фото сохранятся, новые будут добавлены к ним.</div>
            </div>
            <button type="submit" class="btn btn-primary w-100">Сохранить</button>
          </form>
        `
    );

    const form = document.getElementById('editListingForm');
    if (form) {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            await handleUpdateListing(listing.id);
        });
    }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

async function handleCreateListing() {
    const title = document.getElementById('listingTitle')?.value?.trim();
    const typeId = Number(document.getElementById('listingTypeId')?.value || 1);
    const price = Number(document.getElementById('listingPrice')?.value || 0);
    const location = document.getElementById('listingLocation')?.value?.trim();
    const description = document.getElementById('listingDescription')?.value?.trim();
    const photosInput = document.getElementById('listingPhotos');

    if (!title || !price) {
        showModal('createListingModal', 'Добавить объявление', '<div class="alert alert-warning">Заполните название и цену</div>');
        return;
    }

    try {
        const photos = await uploadPhotoIdsFromInput(photosInput);
        await listingsAPI.create({
            title,
            price,
            location: location || null,
            description: description || null,
            typeId: Number.isFinite(typeId) && typeId > 0 ? typeId : 1,
            photos,
        });
        showModal('createListingModal', 'Добавить объявление', '<div class="alert alert-success">Объявление создано</div>');
        await refreshLandlordListingUIs();
    } catch (error) {
        console.error('Error creating listing:', error);
        const message = error?.message ? escapeHtml(error.message) : 'Не удалось создать объявление';
        showModal('createListingModal', 'Добавить объявление', `<div class="alert alert-danger">${message}</div>`);
    }
}

async function handleUpdateListing(listingId) {
    const title = document.getElementById('editListingTitle')?.value?.trim();
    const typeId = Number(document.getElementById('editListingTypeId')?.value || 1);
    const price = Number(document.getElementById('editListingPrice')?.value || 0);
    const location = document.getElementById('editListingLocation')?.value?.trim();
    const description = document.getElementById('editListingDescription')?.value?.trim();
    const photosInput = document.getElementById('editListingPhotos');

    if (!title || !price) {
        showModal('editListingModal', 'Редактировать объявление', '<div class="alert alert-warning">Заполните название и цену</div>');
        return;
    }

    try {
        const existingListing = await listingsAPI.getById(listingId);
        const existingPhotos = Array.isArray(existingListing?.photos)
            ? existingListing.photos.map(extractPhotoIdFromUrl).filter(Boolean)
            : [];
        const newPhotoIds = await uploadPhotoIdsFromInput(photosInput);
        const photos = [...existingPhotos, ...newPhotoIds];
        await listingsAPI.update({
            id: listingId,
            title,
            price,
            location: location || null,
            description: description || null,
            typeId: Number.isFinite(typeId) && typeId > 0 ? typeId : 1,
            photos: Array.from(new Set(photos)),
        });
        showModal('editListingModal', 'Редактировать объявление', '<div class="alert alert-success">Объявление обновлено</div>');
        await refreshLandlordListingUIs();
    } catch (error) {
        console.error('Error updating listing:', error);
        const message = error?.message ? escapeHtml(error.message) : 'Не удалось обновить объявление';
        showModal('editListingModal', 'Редактировать объявление', `<div class="alert alert-danger">${message}</div>`);
    }
}

function extractPhotoIdFromUrl(value) {
    if (!value || typeof value !== 'string') return '';
    const clean = value.split('?')[0].split('#')[0];
    const lastPart = clean.split('/').pop() || '';
    try {
        return decodeURIComponent(lastPart);
    } catch {
        return lastPart;
    }
}

async function uploadPhotoIdsFromInput(input) {
    if (!input || !input.files?.length) return [];
    const files = Array.from(input.files);
    const uploaded = [];
    for (const file of files) {
        const photoId = await listingsAPI.uploadPhoto(file);
        if (photoId) uploaded.push(photoId);
    }
    return uploaded;
}

async function loadBookings(userId) {
    try {
        const bookings = await bookingsAPI.getByUserId(userId);
        const filteredBookings =
            currentUser?.type === 'landlord'
                ? bookings.filter((booking) => booking.landlordId === userId && booking.status !== 'cancelled')
                : bookings.filter((booking) => booking.tenantId === userId && booking.status !== 'cancelled');
        const target = document.getElementById('rentalsList');
        if (!target) return;
        if (!filteredBookings.length) {
            target.innerHTML =
                currentUser?.type === 'landlord'
                    ? '<p class="text-muted">У вас нет активных сделок.</p>'
                    : '<p class="text-muted">У вас нет активных бронирований.</p>';
            return;
        }
        const cards = await Promise.all(
            filteredBookings.map(async (booking) => {
                try {
                    const listing = await listingsAPI.getById(booking.listingId);
                    const startDate = booking.startDate ? new Date(booking.startDate).toLocaleDateString('ru-RU') : '—';
                    const endDate = booking.endDate ? new Date(booking.endDate).toLocaleDateString('ru-RU') : '—';
                    return `
                      <div class="card mb-2"><div class="card-body">
                        <strong>${listing?.title || booking.listingId}</strong><br/>
                        ${startDate} — ${endDate}
                      </div></div>
                    `;
                } catch {
                    return '';
                }
            })
        );
        target.innerHTML = cards.join('');
    } catch (error) {
        console.error('Error loading bookings:', error);
    }
}

async function loadChats() {
    const chatsList = document.getElementById('chatsList');
    if (!chatsList) return;
    try {
        const chats = await chatsAPI.getMyChats();
        if (!chats.length) {
            chatsList.innerHTML = '<div class="text-muted">Чатов пока нет.</div>';
            return;
        }
        const items = await Promise.all(chats.map(async (chat) => {
            const otherUserId = chat.userAId === currentUser.id ? chat.userBId : chat.userAId;
            let otherName = otherUserId;
            try {
                const other = await usersAPI.getById(otherUserId);
                otherName = other?.name || other?.email || otherUserId;
            } catch {}
            return `<button class="list-group-item list-group-item-action chat-item" data-chat-id="${chat.id}" data-user-id="${otherUserId}">${otherName}</button>`;
        }));
        chatsList.innerHTML = items.join('');
        chatsList.querySelectorAll('.chat-item').forEach((button) => {
            button.addEventListener('click', () => {
                const chatId = button.dataset.chatId;
                const userId = button.dataset.userId;
                if (!chatId || !userId) return;
                void openChat(chatId, userId);
            });
        });

        const requestedChatId = parseProfileQuery().chatId;
        if (requestedChatId) {
            const match = chats.find((chat) => String(chat.id) === String(requestedChatId));
            if (match) {
                const otherUserId = match.userAId === currentUser.id ? match.userBId : match.userAId;
                await openChat(match.id, otherUserId);
            }
        }

        const form = document.getElementById('chatSendForm');
        if (form) {
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                const input = document.getElementById('chatTextInput');
                const text = input?.value?.trim();
                if (!activeChatId || !text) return;
                await chatsAPI.sendMessage(activeChatId, text);
                input.value = '';
                const header = document.getElementById('chatHeader');
                const userId = header?.dataset?.userId;
                if (userId) await openChat(activeChatId, userId);
            });
        }
    } catch (error) {
        console.error('Error loading chats:', error);
        chatsList.innerHTML = '<div class="alert alert-danger">Не удалось загрузить чаты</div>';
    }
}

async function openChat(chatId, otherUserId) {
    activeChatId = chatId;
    const header = document.getElementById('chatHeader');
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer || !header) return;

    let otherName = otherUserId;
    try {
        const other = await usersAPI.getById(otherUserId);
        otherName = other?.name || other?.email || otherUserId;
    } catch {}

    header.innerHTML = `Чат с <button class="btn btn-link p-0 align-baseline" id="chatUserLink">${otherName}</button>`;
    header.dataset.userId = otherUserId;
    const userLink = document.getElementById('chatUserLink');
    if (userLink) {
        userLink.addEventListener('click', () => showUserCard(otherUserId));
    }

    const messages = await chatsAPI.getMessages(chatId);
    if (!messages.length) {
        messagesContainer.innerHTML = '<div class="text-muted">Сообщений пока нет.</div>';
        return;
    }
    messagesContainer.innerHTML = messages
        .map((message) => {
            const mine = message.senderId === currentUser.id;
            return `
              <div class="mb-2 d-flex ${mine ? 'justify-content-end' : 'justify-content-start'}">
                <div class="p-2 rounded ${mine ? 'bg-primary text-white' : 'bg-light'}" style="max-width: 70%;">
                  <div>${message.text}</div>
                </div>
              </div>
            `;
        })
        .join('');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

window.addEventListener('DOMContentLoaded', async () => {
    const tabs = document.querySelectorAll('.list-group-item');
    tabs.forEach((tab) => {
        tab.addEventListener('click', (event) => {
            event.preventDefault();
            tabs.forEach((item) => item.classList.remove('active'));
            tab.classList.add('active');
            void switchToTab(tab.textContent.trim());
        });
    });
    await bootstrapProfile();
});
