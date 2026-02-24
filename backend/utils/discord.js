const axios = require('axios');

const sendDiscordNotification = async (webhookUrl, event) => {
  if (!webhookUrl) return;

  try {
    const embed = {
      title: `🎉 New Event Announced: ${event.name}`,
      description: event.description || 'No description provided.',
      url: `http://localhost:3000/events/${event._id}`, 
      color: 5814783, 
      fields: [
        {
          name: '📅 Date',
          value: new Date(event.event_start_date).toLocaleDateString(),
          inline: true,
        },
        {
          name: '🏷️ Type',
          value: event.type,
          inline: true,
        },
        {
          name: '⏳ Deadline',
          value: new Date(event.registration_deadline).toLocaleDateString(),
          inline: true,
        }
      ],
      footer: {
        text: 'Register now!',
      },
      timestamp: new Date().toISOString(),
    };

    await axios.post(webhookUrl, {
      content: "A new event has been published!",
      embeds: [embed],
    });
    console.log(`Discord notification sent for event: ${event.name}`);
  } catch (error) {
    console.error('Failed to send Discord notification:', error.message);
  }
};

module.exports = { sendDiscordNotification };
