const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  room: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  text: { type: String, required: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
});

chatMessageSchema.index({ room: 1, createdAt: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
