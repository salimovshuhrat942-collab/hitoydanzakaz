const mongoose = require('mongoose');
const { Schema } = mongoose;

const User = mongoose.model(
  'User',
  new Schema({
    tgId: { type: Number, unique: true, index: true },
    name: String,
    username: String,
    createdAt: { type: Date, default: Date.now },
    lastSeen: { type: Date, default: Date.now },
  })
);

const Seller = mongoose.model(
  'Seller',
  new Schema({
    tgId: { type: Number, unique: true, index: true },
    name: String,
    channel: String, // kanal chat ID (masalan -1001234567890)
    channelTitle: String,
    channelUsername: String,
    cardNumber: String, // 16 xonali karta raqami
    cardHolder: String, // karta egasi ismi
    createdAt: { type: Date, default: Date.now },
  })
);

const Category = mongoose.model(
  'Category',
  new Schema({
    name: String,
    icon: { type: String, default: '📦' },
    order: { type: Number, default: 0 },
  })
);

const Image = mongoose.model(
  'Image',
  new Schema({
    data: Buffer,
    type: { type: String, default: 'image/jpeg' },
    private: { type: Boolean, default: false }, // to'lov cheklari (ochiq berilmaydi)
    createdAt: { type: Date, default: Date.now },
  })
);

const Product = mongoose.model(
  'Product',
  new Schema({
    seller: { type: Number, index: true }, // sotuvchi Telegram ID
    title: String,
    description: String,
    price: Number,
    category: String,
    image: { type: Schema.Types.ObjectId, ref: 'Image' },
    views: { type: Number, default: 0 },
    orders: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    channelMsgId: Number,
    createdAt: { type: Date, default: Date.now, index: true },
  })
);

const Order = mongoose.model(
  'Order',
  new Schema({
    product: { type: Schema.Types.ObjectId, ref: 'Product' },
    productTitle: String,
    productImage: { type: Schema.Types.ObjectId, ref: 'Image' },
    price: Number,
    qty: { type: Number, default: 1 },
    seller: { type: Number, index: true },
    buyer: { type: Number, index: true },
    buyerName: String,
    buyerUsername: String,
    name: String,
    phone: String,
    region: String,
    district: String,
    note: String,
    status: { type: String, default: 'new' }, // new | accepted | rejected | done
    source: { type: String, default: 'webapp' }, // webapp | bot
    receipt: { type: Schema.Types.ObjectId, ref: 'Image' }, // to'lov cheki rasmi
    createdAt: { type: Date, default: Date.now, index: true },
  })
);

const Ad = mongoose.model(
  'Ad',
  new Schema({
    title: String,
    text: String,
    link: String,
    image: { type: Schema.Types.ObjectId, ref: 'Image' },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  })
);

// lean() so'rovlarda Buffer maydon Binary bo'lib keladi — oddiy Buffer'ga aylantiramiz
const toBuf = (d) => (Buffer.isBuffer(d) ? d : Buffer.from(d.buffer));

module.exports = { User, Seller, Category, Image, Product, Order, Ad, toBuf };
