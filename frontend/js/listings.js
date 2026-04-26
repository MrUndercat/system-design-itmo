async function loadListings() {
    const listingsContainer = document.getElementById('listings');
    const resultsCount = document.getElementById('resultsCount');
    
    if (!listingsContainer) return;

    try {
        listingsContainer.innerHTML = '<div class="col-12"><div class="text-center">Загрузка...</div></div>';

        const [listings, currentUser] = await Promise.all([
            listingsAPI.getAll(),
            authAPI.getCurrentUser().catch(() => null),
        ]);
        const hideChatButton = currentUser?.type !== 'tenant';

        listingsContainer.innerHTML = '';

        if (listings.length === 0) {
            listingsContainer.innerHTML = '<div class="col-12"><div class="text-center">Объявления не найдены</div></div>';
            if (resultsCount) resultsCount.textContent = '0 найдено';
            return;
        }

        listings.forEach((listing) => {
            const card = createListingCard(listing, { hideChatButton });
            listingsContainer.appendChild(card);
        });

        if (resultsCount) {
            resultsCount.textContent = `${listings.length} найдено`;
        }

        applyFiltersToLoadedListings();
        initListingActions();
    } catch (error) {
        console.error('Error loading listings:', error);
        const errorMessage = error.message || 'Ошибка загрузки объявлений';
        listingsContainer.innerHTML = `<div class="col-12"><div class="alert alert-danger">${errorMessage}</div></div>`;
        if (resultsCount) resultsCount.textContent = 'Ошибка';
    }
}

function createListingCard(listing, options = {}) {
    const { hideChatButton = false } = options;
    const fallbackImage = "https://placehold.co/600x400?text=No+Photo";
    const photos = normalizeListingPhotos(listing);
    const useCarousel = photos.length > 1;
    const carouselId = `listingCarousel-${listing.id}`;

    const altText = String(listing.title || "Объявление").replaceAll('"', "&quot;");
    const imgAttrs = (src, extraClass = "") =>
        `src="${src}" class="card-img-top ${extraClass}" alt="${altText}" onerror="this.onerror=null;this.src='${fallbackImage}'"`;

    let mediaHtml;
    if (useCarousel) {
        const carouselInner = photos
            .map(
                (photo, index) => `
              <div class="carousel-item ${index === 0 ? "active" : ""}">
                <img ${imgAttrs(photo, "d-block w-100")}>
              </div>
            `
            )
            .join("");
        mediaHtml = `
            <div id="${carouselId}" class="carousel slide listing-carousel" data-bs-ride="false" data-bs-interval="false">
              <div class="carousel-inner">
                ${carouselInner}
              </div>
              <button class="carousel-control-prev" type="button" data-bs-target="#${carouselId}" data-bs-slide="prev">
                <span class="carousel-control-prev-icon" aria-hidden="true"></span>
                <span class="visually-hidden">Предыдущее фото</span>
              </button>
              <button class="carousel-control-next" type="button" data-bs-target="#${carouselId}" data-bs-slide="next">
                <span class="carousel-control-next-icon" aria-hidden="true"></span>
                <span class="visually-hidden">Следующее фото</span>
              </button>
            </div>
        `;
    } else {
        const singleSrc = photos[0] || fallbackImage;
        mediaHtml = `<div class="listing-static-media"><img ${imgAttrs(singleSrc)}></div>`;
    }

    const col = document.createElement('div');
    col.className = 'col-md-6';
    col.setAttribute('data-type', listing.type);
    col.setAttribute('data-price', listing.price);
    col.setAttribute('data-location', listing.location);
    col.setAttribute('data-id', listing.id);

    col.innerHTML = `
        <div class="card h-100">
            ${mediaHtml}
            <div class="card-body">
                <h5 class="card-title">${listing.title}</h5>
                <p class="card-text">Цена: ${listing.price.toLocaleString('ru-RU')} ₽ / мес · Район: ${listing.location}</p>
                <div class="d-flex flex-wrap gap-2">
                  <button class="btn btn-outline-primary btn-details"
                          data-id="${listing.id}">
                      Подробнее
                  </button>
                  <button class="btn btn-outline-secondary btn-author"
                          data-owner-id="${listing.ownerId}"
                          data-listing-id="${listing.id}">
                      Автор
                  </button>
                  ${
                      hideChatButton
                          ? ''
                          : `<button class="btn btn-outline-success btn-chat"
                          data-owner-id="${listing.ownerId}"
                          data-listing-id="${listing.id}">
                      Написать
                  </button>`
                  }
                  <button class="btn btn-outline-dark btn-reviews"
                          data-listing-id="${listing.id}">
                      Посмотреть отзывы
                  </button>
                </div>
            </div>
        </div>
    `;

    return col;
}

function normalizeListingPhotos(listing) {
    const fromPhotos = Array.isArray(listing.photos) ? listing.photos : [];
    const images = fromPhotos.filter((value) => typeof value === 'string' && value.trim());
    if (images.length) return images;
    if (listing.image && typeof listing.image === 'string') return [listing.image];
    return ['https://placehold.co/600x400?text=Listing'];
}

function applyFiltersToLoadedListings() {
    const applyBtn = document.getElementById('applyFilters');
    const clearBtn = document.getElementById('clearFilters');
    
    if (!applyBtn || !clearBtn) return;

    function applyFilters() {
        const type = document.getElementById('typeFilter')?.value || 'any';
        const maxPrice = Number(document.getElementById('priceFilter')?.value) || Infinity;
        const loc = (document.getElementById('locationFilter')?.value || '').trim().toLowerCase();

        const listings = Array.from(document.querySelectorAll('#listings > [data-type]'));
        let visible = 0;

        listings.forEach(card => {
            const cardType = card.getAttribute('data-type');
            const cardPrice = Number(card.getAttribute('data-price'));
            const cardLoc = (card.getAttribute('data-location') || '').toLowerCase();

            const okType = (type === 'any') || (type === cardType);
            const okPrice = cardPrice <= maxPrice;
            const okLoc = loc === '' || cardLoc.includes(loc);

            if (okType && okPrice && okLoc) {
                card.style.display = '';
                visible++;
            } else {
                card.style.display = 'none';
            }
        });

        const resultsCount = document.getElementById('resultsCount');
        if (resultsCount) {
            resultsCount.textContent = `${visible} найдено`;
        }
    }

    applyBtn.addEventListener('click', applyFilters);
    clearBtn.addEventListener('click', () => {
        document.getElementById('filterForm')?.reset();
        const listings = Array.from(document.querySelectorAll('#listings > [data-type]'));
        listings.forEach(c => c.style.display = '');
        const resultsCount = document.getElementById('resultsCount');
        if (resultsCount) {
            resultsCount.textContent = `${listings.length} найдено`;
        }
    });
}

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
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
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
    new bootstrap.Modal(modalElement).show();
}

async function showUserCard(userId, listingId) {
    try {
        const [user, viewer] = await Promise.all([
            usersAPI.getById(userId),
            authAPI.getCurrentUser().catch(() => null),
        ]);
        if (!user) {
            showModal('userCardModal', 'Автор', '<div class="alert alert-warning">Пользователь не найден</div>');
            return;
        }
        const hideWriteButton = viewer?.type !== 'tenant';
        const writeButtonHtml = hideWriteButton
            ? ''
            : '<button class="btn btn-success w-100 mt-2" id="writeToUserBtn">Написать сообщение</button>';
        showModal(
            'userCardModal',
            'Карточка пользователя',
            `
              <p><strong>Имя:</strong> ${user.name || 'Не указано'}</p>
              <p><strong>Email:</strong> ${user.email || 'Не указано'}</p>
              <p><strong>Тип:</strong> ${user.type || 'Не указано'}</p>
              ${writeButtonHtml}
            `
        );
        if (!hideWriteButton) {
            const writeBtn = document.getElementById('writeToUserBtn');
            if (writeBtn) {
                writeBtn.addEventListener('click', () => startChatWithUser(userId, listingId));
            }
        }
    } catch (error) {
        console.error('Error loading user card:', error);
        showModal('userCardModal', 'Автор', '<div class="alert alert-danger">Ошибка загрузки карточки пользователя</div>');
    }
}

async function startChatWithUser(otherUserId, listingId = null) {
    const viewer = await authAPI.getCurrentUser();
    if (viewer?.type !== 'tenant') {
        showModal(
            'userCardModal',
            'Сообщения',
            '<p class="text-muted">Написать сообщение могут только зарегистрированные арендаторы.</p>'
        );
        return;
    }
    try {
        const chat = await chatsAPI.createOrGetChat(otherUserId, listingId);
        if (!chat?.id) throw new Error('chat not created');
        window.location.href = `profile.html?chatId=${encodeURIComponent(chat.id)}&tab=messages`;
    } catch (error) {
        console.error('Error creating/opening chat:', error);
        showModal('userCardModal', 'Чаты', '<div class="alert alert-danger">Не удалось открыть чат</div>');
    }
}

async function showListingReviews(listingId) {
    try {
        const reviews = await reviewsAPI.getByListing(listingId);
        if (!reviews.length) {
            showModal('reviewsModal', 'Отзывы', '<p class="text-muted">По этому объекту пока нет отзывов.</p>');
            return;
        }
        const items = reviews
            .map(
                (review) => `
                <div class="border rounded p-2 mb-2">
                  <div><strong>Оценка:</strong> ${review.rating}/5</div>
                  <div>${review.text || 'Без текста'}</div>
                </div>
            `
            )
            .join('');
        showModal('reviewsModal', 'Отзывы по собственности', items);
    } catch (error) {
        console.error('Error loading reviews:', error);
        showModal('reviewsModal', 'Отзывы', '<div class="alert alert-danger">Ошибка загрузки отзывов</div>');
    }
}

function initListingActions() {
    document.querySelectorAll('.btn-details').forEach((button) => {
        button.addEventListener('click', async () => {
            const listingId = button.dataset.id;
            if (!listingId) return;
            try {
                const listing = await listingsAPI.getById(listingId);
                showModal(
                    'detailsModal',
                    listing.title || 'Детали объявления',
                    `
                        <p><strong>Описание:</strong> ${listing.description || 'Не указано'}</p>
                        <p><strong>Тип:</strong> ${getTypeName(listing.type)}</p>
                        <p><strong>Цена:</strong> ${Number(listing.price).toLocaleString('ru-RU')} ₽ / мес</p>
                        <p><strong>Район:</strong> ${listing.location || 'Не указано'}</p>
                        ${listing.rooms ? `<p><strong>Комнат:</strong> ${listing.rooms}</p>` : ''}
                        ${listing.area ? `<p><strong>Площадь:</strong> ${listing.area} м²</p>` : ''}
                    `
                );
            } catch (error) {
                console.error('Error loading listing details:', error);
                showModal('detailsModal', 'Детали объявления', '<div class="alert alert-danger">Ошибка загрузки</div>');
            }
        });
    });

    document.querySelectorAll('.btn-author').forEach((button) => {
        button.addEventListener('click', () => {
            const ownerId = button.dataset.ownerId;
            const listingId = button.dataset.listingId;
            if (!ownerId) return;
            void showUserCard(ownerId, listingId || null);
        });
    });

    document.querySelectorAll('.btn-chat').forEach((button) => {
        button.addEventListener('click', () => {
            const ownerId = button.dataset.ownerId;
            const listingId = button.dataset.listingId;
            if (!ownerId) return;
            void startChatWithUser(ownerId, listingId || null);
        });
    });

    document.querySelectorAll('.btn-reviews').forEach((button) => {
        button.addEventListener('click', () => {
            const listingId = button.dataset.listingId;
            if (!listingId) return;
            void showListingReviews(listingId);
        });
    });
}

function getTypeName(type) {
    const types = {
        'apartment': 'Квартира',
        'house': 'Дом',
        'studio': 'Студия'
    };
    return types[type] || type;
}

document.addEventListener('DOMContentLoaded', () => {
    loadListings();
});
