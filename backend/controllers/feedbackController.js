const Feedback = require('../models/Feedback');
const Event = require('../models/Event');
const EventRegistration = require('../models/EventRegistration');


const submitFeedback = async (req, res) => {
  try {
    const eventId = req.params.id;
    const participantId = req.participant._id;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });

    const reg = await EventRegistration.findOne({ eventId, participantId, status: { $ne: 'CANCELLED' } });
    if (!reg) {
      return res.status(403).json({ success: false, error: 'You must be registered for this event to leave feedback' });
    }

    const now = new Date();
    if (event.event_end_date && new Date(event.event_end_date) > now) {
      return res.status(400).json({ success: false, error: 'Feedback can only be submitted after the event has ended' });
    }

    const rating = Number(req.body.rating);
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: 'Rating must be between 1 and 5' });
    }

    const comment = (req.body.comment || '').trim().slice(0, 2000);

    const feedback = await Feedback.findOneAndUpdate(
      { eventId, participantId },
      { rating, comment },
      { new: true, upsert: true, runValidators: true }
    );

    res.status(200).json({ success: true, data: { rating: feedback.rating, comment: feedback.comment, updatedAt: feedback.updatedAt } });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, error: 'Feedback already submitted' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
};


const getMyFeedback = async (req, res) => {
  try {
    const eventId = req.params.id;
    const participantId = req.participant._id;

    const fb = await Feedback.findOne({ eventId, participantId }).select('rating comment updatedAt');
    if (!fb) return res.status(404).json({ success: false, error: 'No feedback found' });

    res.json({ success: true, data: { rating: fb.rating, comment: fb.comment, updatedAt: fb.updatedAt } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


const getFeedbackSummary = async (req, res) => {
  try {
    const eventId = req.params.id;

    const [agg] = await Feedback.aggregate([
      { $match: { eventId: require('mongoose').Types.ObjectId.createFromHexString(eventId) } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          count: { $sum: 1 },
        },
      },
    ]);

    const dist = await Feedback.aggregate([
      { $match: { eventId: require('mongoose').Types.ObjectId.createFromHexString(eventId) } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]);

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    dist.forEach((d) => { distribution[d._id] = d.count; });

    res.json({
      success: true,
      data: {
        avgRating: agg ? Math.round(agg.avgRating * 100) / 100 : 0,
        count: agg ? agg.count : 0,
        distribution,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const getFeedback = async (req, res) => {
  try {
    const eventId = req.params.id;
    const filter = { eventId };

    if (req.query.rating) {
      const r = Number(req.query.rating);
      if (r >= 1 && r <= 5) filter.rating = r;
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Feedback.find(filter)
        .select('rating comment createdAt') 
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Feedback.countDocuments(filter),
    ]);

    res.json({ success: true, data: { items, total, page, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


const exportFeedbackCsv = async (req, res) => {
  try {
    const eventId = req.params.id;
    const items = await Feedback.find({ eventId })
      .select('rating comment createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const header = 'Rating,Comment,Date\n';
    const rows = items.map((fb) => {
      const comment = (fb.comment || '').replace(/"/g, '""');
      return `${fb.rating},"${comment}",${new Date(fb.createdAt).toISOString()}`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=feedback-${eventId}.csv`);
    res.send(header + rows.join('\n'));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  submitFeedback,
  getMyFeedback,
  getFeedbackSummary,
  getFeedback,
  exportFeedbackCsv,
};
