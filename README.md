# n8n-nodes-max

This is an n8n community node that lets you use Max messenger in your n8n workflows.

Max messenger is a popular Russian messaging platform that provides a comprehensive Bot API for creating interactive chatbots and automated messaging solutions.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)  
[Compatibility](#compatibility)  
[Usage](#usage)  
[Example Workflows](#example-workflows)  
[Troubleshooting](#troubleshooting)  
[Resources](#resources)  
[Version History](#version-history)  

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

Install the package using npm:

```bash
npm install n8n-nodes-max
```

For n8n cloud users, you can install this node directly from the community nodes section in your n8n instance.

## Operations

The Max messenger node supports the following operations:

### Message Operations
- **Send Message**: Send text messages to users or chats with formatting support (HTML/Markdown)
- **Edit Message**: Modify existing message content
- **Delete Message**: Remove messages from chats
- **Answer Callback Query**: Respond to inline keyboard button interactions

### Chat Operations
- **Get Chat Info**: Retrieve chat metadata and participant information
- **Leave Chat**: Remove the bot from group chats

### Advanced Features
- **File Attachments**: Send images, videos, audio files, and documents
- **Inline Keyboards**: Create interactive button layouts with callbacks, links, and special actions
- **Text Formatting**: Support for HTML and Markdown formatting
- **Error Handling**: Comprehensive error handling with retry mechanisms

### Trigger Node
The Max Trigger node allows you to receive real-time events from Max messenger:
- **Message Events**: New messages, edited messages, deleted messages
- **Bot Events**: Bot started, bot added/removed from chats
- **User Events**: Users joining/leaving chats
- **Callback Events**: Button interactions and responses

## Credentials

To use the Max messenger node, you need to create a bot and obtain an access token:

### Prerequisites
1. Have a Max messenger account
2. Access to @MasterBot in Max messenger

### Setting up Bot Credentials

1. **Create a Bot**:
   - Open Max messenger and find @MasterBot
   - Send `/newbot` command to @MasterBot
   - Follow the instructions to create your bot
   - Choose a name and username for your bot
   - Save the access token provided by @MasterBot

2. **Configure Credentials in n8n**:
   - In your n8n workflow, add a Max node
   - Click "Create New Credentials"
   - Enter your bot's access token in the "Access Token" field
   - (Optional) Modify the "Base URL" if using a custom Max API endpoint
   - Click "Save" to store your credentials

3. **Test Your Credentials**:
   - n8n will automatically test your credentials by making a request to the Max API
   - If successful, you'll see a green checkmark
   - If there's an error, verify your token is correct and your bot is active

### Security Notes
- Keep your bot token secure and never share it publicly
- Use environment variables for token storage in production environments
- Regularly rotate your bot tokens for enhanced security

## Compatibility

- **Minimum n8n version**: 1.0.0
- **Node.js version**: 20.15 or higher
- **Tested with n8n versions**: 1.0.0 - 1.70.0

### Known Compatibility Issues
- None currently identified

## Usage

### Basic Message Sending

1. **Add Max Node**: Drag the Max node into your workflow
2. **Configure Credentials**: Set up your bot credentials as described above
3. **Select Operation**: Choose "Send Message" from the Message resource
4. **Set Recipients**: 
   - For direct messages: Enter the user ID in "User ID" field
   - For group chats: Enter the chat ID in "Chat ID" field
5. **Compose Message**: Enter your message text with optional formatting
6. **Execute**: Run the workflow to send your message

### Working with Attachments

To send files with your messages:

1. **Enable Attachments**: Toggle the "Add Attachments" option
2. **Choose Attachment Type**: Select from image, video, audio, file, or sticker
3. **Provide File Source**:
   - **Binary Data**: Use data from previous nodes (recommended)
   - **File Path**: Specify a local file path
   - **URL**: Provide a direct link to the file
4. **Configure Options**: Set additional parameters like captions or thumbnails

### Creating Interactive Keyboards

To add interactive buttons to your messages:

1. **Enable Keyboard**: Toggle the "Add Keyboard" option
2. **Choose Keyboard Type**: Select "Inline Keyboard"
3. **Add Buttons**: Configure button rows with:
   - **Text**: Button label visible to users
   - **Type**: Choose from callback, link, contact request, or location request
   - **Payload/URL**: Set the action data for the button
4. **Layout**: Organize buttons in rows (max 8 buttons per row)

### Setting up Webhooks (Trigger Node)

1. **Add Max Trigger Node**: Drag the Max Trigger node into your workflow
2. **Configure Credentials**: Use the same bot credentials
3. **Set Webhook URL**: Copy the webhook URL provided by n8n
4. **Register Webhook**: The node will automatically register the webhook with Max API
5. **Choose Events**: Select which event types to listen for
6. **Test**: Send a message to your bot to verify the trigger works

## Example Workflows

### 1. Simple Echo Bot

This workflow creates a bot that echoes back any message it receives:

```json
{
  "nodes": [
    {
      "name": "Max Trigger",
      "type": "n8n-nodes-max.maxTrigger",
      "position": [250, 300],
      "parameters": {
        "events": ["message_created"]
      }
    },
    {
      "name": "Echo Response",
      "type": "n8n-nodes-max.max",
      "position": [450, 300],
      "parameters": {
        "resource": "message",
        "operation": "sendMessage",
        "chatId": "={{$node['Max Trigger'].json['chat']['id']}}",
        "text": "You said: {{$node['Max Trigger'].json['message']['text']}}"
      }
    }
  ],
  "connections": {
    "Max Trigger": {
      "main": [
        [
          {
            "node": "Echo Response",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

### 2. File Upload Notification

This workflow monitors a folder and sends notifications with file attachments:

```json
{
  "nodes": [
    {
      "name": "Watch Folder",
      "type": "n8n-nodes-base.localFileTrigger",
      "position": [250, 300],
      "parameters": {
        "path": "/path/to/watch",
        "triggerOn": "fileAdded"
      }
    },
    {
      "name": "Send File",
      "type": "n8n-nodes-max.max",
      "position": [450, 300],
      "parameters": {
        "resource": "message",
        "operation": "sendMessage",
        "chatId": "YOUR_CHAT_ID",
        "text": "New file uploaded: {{$node['Watch Folder'].json['name']}}",
        "additionalFields": {
          "attachments": {
            "attachment": [
              {
                "type": "file",
                "binaryData": true,
                "binaryProperty": "data"
              }
            ]
          }
        }
      }
    }
  ]
}
```

### 3. Interactive Menu Bot

This workflow creates a bot with an interactive menu:

```json
{
  "nodes": [
    {
      "name": "Max Trigger",
      "type": "n8n-nodes-max.maxTrigger",
      "position": [250, 300],
      "parameters": {
        "events": ["message_created", "message_callback"]
      }
    },
    {
      "name": "Check Message Type",
      "type": "n8n-nodes-base.if",
      "position": [450, 300],
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{$node['Max Trigger'].json['event_type']}}",
              "value2": "message_created"
            }
          ]
        }
      }
    },
    {
      "name": "Send Menu",
      "type": "n8n-nodes-max.max",
      "position": [650, 200],
      "parameters": {
        "resource": "message",
        "operation": "sendMessage",
        "chatId": "={{$node['Max Trigger'].json['chat']['id']}}",
        "text": "Choose an option:",
        "additionalFields": {
          "keyboard": {
            "keyboardType": "inline",
            "inlineKeyboard": {
              "rows": [
                {
                  "buttons": [
                    {
                      "text": "Option 1",
                      "type": "callback",
                      "payload": "option_1"
                    },
                    {
                      "text": "Option 2",
                      "type": "callback",
                      "payload": "option_2"
                    }
                  ]
                }
              ]
            }
          }
        }
      }
    },
    {
      "name": "Handle Callback",
      "type": "n8n-nodes-max.max",
      "position": [650, 400],
      "parameters": {
        "resource": "message",
        "operation": "answerCallbackQuery",
        "callbackQueryId": "={{$node['Max Trigger'].json['callback']['id']}}",
        "text": "You selected: {{$node['Max Trigger'].json['callback']['payload']}}"
      }
    }
  ]
}
```

### 4. Customer Support Bot

This workflow creates a customer support bot that categorizes inquiries:

```json
{
  "nodes": [
    {
      "name": "Max Trigger",
      "type": "n8n-nodes-max.maxTrigger",
      "position": [250, 300]
    },
    {
      "name": "Categorize Inquiry",
      "type": "n8n-nodes-base.if",
      "position": [450, 300],
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{$node['Max Trigger'].json['message']['text'].toLowerCase()}}",
              "operation": "contains",
              "value2": "billing"
            }
          ]
        }
      }
    },
    {
      "name": "Billing Response",
      "type": "n8n-nodes-max.max",
      "position": [650, 200],
      "parameters": {
        "resource": "message",
        "operation": "sendMessage",
        "chatId": "={{$node['Max Trigger'].json['chat']['id']}}",
        "text": "I'll connect you with our billing department. Please wait..."
      }
    },
    {
      "name": "General Response",
      "type": "n8n-nodes-max.max",
      "position": [650, 400],
      "parameters": {
        "resource": "message",
        "operation": "sendMessage",
        "chatId": "={{$node['Max Trigger'].json['chat']['id']}}",
        "text": "Thank you for contacting us. How can I help you today?"
      }
    }
  ]
}
```

## Troubleshooting

### Common Issues and Solutions

#### 1. "Invalid Bot Token" Error

**Problem**: Credentials test fails with authentication error.

**Solutions**:
- Verify your bot token is correct and hasn't expired
- Ensure your bot is active (not deleted or suspended)
- Check that you're using the token from @MasterBot, not another bot platform
- Try creating a new bot token if the issue persists

#### 2. "Chat Not Found" Error

**Problem**: Cannot send messages to a specific chat or user.

**Solutions**:
- Verify the chat ID or user ID is correct
- Ensure the bot has been added to the group chat (for group messages)
- Check that the user hasn't blocked your bot
- For new chats, the user must initiate contact with the bot first

#### 3. "File Upload Failed" Error

**Problem**: Attachment uploads fail or timeout.

**Solutions**:
- Check file size limits (Max messenger has specific limits per file type)
- Verify file format is supported by Max messenger
- Ensure stable internet connection for large file uploads
- Try using binary data input instead of file paths
- Check file permissions if using local file paths

#### 4. "Rate Limit Exceeded" Error

**Problem**: Too many API requests in a short time period.

**Solutions**:
- Implement delays between messages using Wait nodes
- Reduce the frequency of your workflow executions
- Use batch processing for multiple messages
- Monitor your API usage and implement proper rate limiting

#### 5. Webhook Not Receiving Events

**Problem**: Max Trigger node doesn't receive messages or events.

**Solutions**:
- Verify webhook URL is accessible from the internet
- Check that your n8n instance is publicly reachable
- Ensure the webhook is properly registered with Max API
- Test with a simple message to your bot
- Check n8n logs for webhook registration errors

#### 6. Keyboard Buttons Not Working

**Problem**: Inline keyboard buttons don't respond or cause errors.

**Solutions**:
- Verify button payload format is correct
- Ensure callback query handling is implemented
- Check button text length (Max messenger has limits)
- Validate keyboard structure (max buttons per row)
- Test with simple callback buttons first

#### 7. Message Formatting Issues

**Problem**: HTML or Markdown formatting doesn't display correctly.

**Solutions**:
- Verify HTML tags are properly closed and nested
- Check Markdown syntax is correct
- Ensure special characters are properly escaped
- Test formatting with simple examples first
- Use plain text if formatting continues to fail

### Debug Mode

To enable detailed logging for troubleshooting:

1. Set n8n log level to debug: `N8N_LOG_LEVEL=debug`
2. Check n8n logs for detailed API request/response information
3. Use the "Execute Node" feature to test individual operations
4. Enable "Always Output Data" in node settings to see all response data

### Getting Help

If you continue to experience issues:

1. Check the [Max messenger Bot API documentation](https://dev.max.ru/docs/chatbots/bots-coding/library/js)
2. Review the [n8n community forum](https://community.n8n.io/)
3. Create an issue on the [GitHub repository](https://github.com/pfrankov/n8n-nodes-max)
4. Provide detailed error messages and workflow configurations when seeking help

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Max messenger Bot API documentation](https://dev.max.ru/docs/chatbots/bots-coding/library/js)
- [Max messenger Bot API SDK](https://www.npmjs.com/package/@maxhub/max-bot-api)
- [n8n workflow automation platform](https://n8n.io/)
- [GitHub repository](https://github.com/pfrankov/n8n-nodes-max)

## Version History

### v0.1.0 (Current)
- Initial release with comprehensive Max messenger integration
- Support for message sending, editing, and deletion
- File attachment handling (images, videos, audio, documents)
- Inline keyboard creation with callback support
- Chat management operations
- Webhook trigger node for real-time events
- Comprehensive error handling and validation
- Full test coverage with integration tests

### Planned Features
- Message templates and bulk sending
- Advanced chat administration features
- Message scheduling capabilities
- Analytics and usage tracking
- Enhanced file management options

## License

[MIT](LICENSE.md)
