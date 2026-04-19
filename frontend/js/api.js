const API_BASE_URL = 'http://localhost:3000/graphql';

class GraphQLClient {
  constructor(baseURL = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  async request(query, variables = {}) {
    const headers = {
      'Content-Type': 'application/json',
    };

    const response = await fetch(this.baseURL, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ query, variables }),
    });

    const rawBody = await response.text();
    let payload = null;
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      payload = null;
    }
    if (!payload) {
      throw new Error(response.status === 413 ? 'Слишком большой размер файла' : `HTTP ${response.status}`);
    }
    if (!response.ok || payload.errors?.length) {
      const message = payload.errors?.[0]?.message || `HTTP ${response.status}`;
      throw new Error(message);
    }
    return payload.data;
  }
}

const api = new GraphQLClient();

function humanizeAuthError(message) {
  if (!message || typeof message !== 'string') return message;
  if (
    message.includes('duplicate key') ||
    message.includes('users_email_key') ||
    message.includes('email already registered')
  ) {
    return 'юзер уже существует';
  }
  return message;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

const authAPI = {
  async register(email, password, type = 'tenant') {
    const query = `
      mutation Register($input: RegisterInput!) {
        register(input: $input) {
          id
          email
          name
          type
        }
      }
    `;
    try {
      await api.request(query, {
        input: { email, password, name: email, type },
      });
    } catch (e) {
      const msg = e?.message ? humanizeAuthError(e.message) : e?.message;
      throw new Error(msg || 'Ошибка регистрации');
    }
    return this.login(email, password);
  },

  async login(email, password) {
    const query = `
      mutation Login($email: String!, $password: String!) {
        login(email: $email, password: $password) {
          accessToken
          user {
            id
            email
            name
            type
          }
        }
      }
    `;
    const data = await api.request(query, { email, password });
    return { user: data.login.user };
  },

  async logout() {
    try {
      await api.request(`mutation { logout }`);
    } catch (error) {
      console.error('Error during logout:', error);
    }
  },

  async getCurrentUser() {
    try {
      const data = await api.request(`
        query Me {
          me {
            id
            email
            name
            type
          }
        }
      `);
      return data.me;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  },
};

const listingsAPI = {
  async getAll() {
    const data = await api.request(`
      query Listings {
        listings {
          id
          ownerId
          title
          description
          type
          price
          location
          image
          photos
          rooms
          area
        }
      }
    `);
    return data.listings || [];
  },

  async getById(id) {
    const data = await api.request(
      `
      query Listing($id: ID!) {
        listing(id: $id) {
          id
          ownerId
          title
          description
          type
          price
          location
          image
          photos
          rooms
          area
        }
      }
      `,
      { id }
    );
    return data.listing;
  },

  async create(input) {
    const data = await api.request(
      `
      mutation CreateListing($input: CreateListingInput!) {
        createListing(input: $input) {
          id
          ownerId
          title
          description
          price
          location
          type
          image
          photos
          createdAt
        }
      }
      `,
      { input }
    );
    return data.createListing;
  },

  async update(input) {
    const data = await api.request(
      `
      mutation UpdateListing($input: UpdateListingInput!) {
        updateListing(input: $input) {
          id
          ownerId
          title
          description
          price
          location
          type
          image
          photos
          createdAt
        }
      }
      `,
      { input }
    );
    return data.updateListing;
  },

  async uploadPhoto(file) {
    const base64 = await fileToDataUrl(file);
    const data = await api.request(
      `
      mutation UploadListingPhoto($base64: String!, $contentType: String) {
        uploadListingPhoto(base64: $base64, contentType: $contentType)
      }
      `,
      {
        base64,
        contentType: file?.type || 'application/octet-stream',
      }
    );
    return data.uploadListingPhoto;
  },
};

const usersAPI = {
  async getById(id) {
    const data = await api.request(
      `
      query User($id: ID!) {
        user(id: $id) {
          id
          email
          name
          type
        }
      }
      `,
      { id }
    );
    return data.user;
  },
};

const chatsAPI = {
  async getMyChats() {
    const data = await api.request(`
      query MyChats {
        myChats {
          id
          userAId
          userBId
          listingId
          createdAt
        }
      }
    `);
    return data.myChats || [];
  },

  async createOrGetChat(otherUserId, listingId = null) {
    const data = await api.request(
      `
      mutation CreateOrGetChat($otherUserId: ID!, $listingId: ID) {
        createOrGetChat(otherUserId: $otherUserId, listingId: $listingId) {
          id
          userAId
          userBId
          listingId
          createdAt
        }
      }
      `,
      { otherUserId, listingId }
    );
    return data.createOrGetChat;
  },

  async getMessages(chatId) {
    const data = await api.request(
      `
      query ChatMessages($chatId: ID!) {
        chatMessages(chatId: $chatId) {
          id
          chatId
          senderId
          text
          createdAt
          edited
        }
      }
      `,
      { chatId }
    );
    return data.chatMessages || [];
  },

  async sendMessage(chatId, text) {
    const data = await api.request(
      `
      mutation SendMessage($chatId: ID!, $text: String!) {
        sendMessage(chatId: $chatId, text: $text) {
          id
          chatId
          senderId
          text
          createdAt
        }
      }
      `,
      { chatId, text }
    );
    return data.sendMessage;
  },
};

const reviewsAPI = {
  async getByUser(userId) {
    const data = await api.request(
      `
      query ReviewsByUser($userId: ID!) {
        reviewsByUser(userId: $userId) {
          id
          userId
          authorId
          rating
          text
          createdAt
        }
      }
      `,
      { userId }
    );
    return data.reviewsByUser || [];
  },

  async getByListing(listingId) {
    const data = await api.request(
      `
      query ReviewsByListing($listingId: ID!) {
        reviewsByListing(listingId: $listingId) {
          id
          userId
          authorId
          rating
          text
          createdAt
        }
      }
      `,
      { listingId }
    );
    return data.reviewsByListing || [];
  },
};

const bookingsAPI = {
  async getByUserId(userId) {
    const data = await api.request(
      `
      query BookingsByUser($userId: ID!) {
        bookingsByUser(userId: $userId) {
          id
          listingId
          tenantId
          landlordId
          startDate
          endDate
          status
        }
      }
      `,
      { userId }
    );
    return data.bookingsByUser || [];
  },
};

