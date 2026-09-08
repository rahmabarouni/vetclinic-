class Message {
  final String id;
  final String conversationId;
  final String senderId;
  final String? content;
  final String? attachmentUrl;
  final String? attachmentType;
  final bool isRead;
  final String createdAt;
  final String updatedAt;
  final MessageSender? sender;

  Message({
    required this.id,
    required this.conversationId,
    required this.senderId,
    this.content,
    this.attachmentUrl,
    this.attachmentType,
    required this.isRead,
    required this.createdAt,
    required this.updatedAt,
    this.sender,
  });

  factory Message.fromJson(Map<String, dynamic> json) {
    return Message(
      id: json['id'] as String,
      conversationId: json['conversationId'] as String,
      senderId: json['senderId'] as String,
      content: json['content'] as String?,
      attachmentUrl: json['attachmentUrl'] as String?,
      attachmentType: json['attachmentType'] as String?,
      isRead: json['isRead'] as bool? ?? false,
      createdAt: json['createdAt'] as String? ?? '',
      updatedAt: json['updatedAt'] as String? ?? '',
      sender: json['sender'] != null
          ? MessageSender.fromJson(json['sender'] as Map<String, dynamic>)
          : null,
    );
  }
}

class MessageSender {
  final String id;
  final String email;
  final String firstName;
  final String lastName;
  final String role;

  MessageSender({
    required this.id,
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.role,
  });

  factory MessageSender.fromJson(Map<String, dynamic> json) {
    return MessageSender(
      id: json['id'] as String,
      email: json['email'] as String,
      firstName: json['firstName'] as String,
      lastName: json['lastName'] as String,
      role: json['role'] as String,
    );
  }

  String get fullName => '$firstName $lastName';
}
