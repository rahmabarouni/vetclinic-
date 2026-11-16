import 'message.dart';

class Conversation {
  final String id;
  final String clientId;
  final String? veterinarianId;
  final String status;
  final String createdAt;
  final String updatedAt;
  final ConversationClient? client;
  final ConversationVeterinarian? veterinarian;
  final Message? lastMessage;

  Conversation({
    required this.id,
    required this.clientId,
    this.veterinarianId,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.client,
    this.veterinarian,
    this.lastMessage,
  });

  factory Conversation.fromJson(Map<String, dynamic> json) {
    return Conversation(
      id: json['id'] as String,
      clientId: json['clientId'] as String,
      veterinarianId: json['veterinarianId'] as String?,
      status: json['status'] as String? ?? 'OPEN',
      createdAt: json['createdAt'] as String? ?? '',
      updatedAt: json['updatedAt'] as String? ?? '',
      client: json['client'] != null
          ? ConversationClient.fromJson(json['client'] as Map<String, dynamic>)
          : null,
      veterinarian: json['veterinarian'] != null
          ? ConversationVeterinarian.fromJson(json['veterinarian'] as Map<String, dynamic>)
          : null,
      lastMessage: json['lastMessage'] != null
          ? Message.fromJson(json['lastMessage'] as Map<String, dynamic>)
          : null,
    );
  }

  String get displayName => displayNameFor(null);

  /// Nom de l'interlocuteur selon le point de vue.
  /// Un vétérinaire voit le client, un client voit le vétérinaire.
  String displayNameFor(String? viewerId) {
    final vetUser = veterinarian?.user;
    final clientName = client == null ? null : '${client!.firstName} ${client!.lastName}';
    final vetName = vetUser == null ? null : '${vetUser.firstName} ${vetUser.lastName}';

    if (viewerId != null && vetUser?.id == viewerId) {
      return clientName ?? 'Conversation';
    }
    return vetName ?? clientName ?? 'Conversation';
  }
}

class ConversationClient {
  final String id;
  final String email;
  final String firstName;
  final String lastName;
  final String role;

  ConversationClient({
    required this.id,
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.role,
  });

  factory ConversationClient.fromJson(Map<String, dynamic> json) {
    return ConversationClient(
      id: json['id'] as String,
      email: json['email'] as String,
      firstName: json['firstName'] as String,
      lastName: json['lastName'] as String,
      role: json['role'] as String,
    );
  }
}

class ConversationVeterinarian {
  final String id;
  final String? userId;
  final String? specialty;
  final ConversationUser? user;

  ConversationVeterinarian({
    required this.id,
    this.userId,
    this.specialty,
    this.user,
  });

  factory ConversationVeterinarian.fromJson(Map<String, dynamic> json) {
    return ConversationVeterinarian(
      id: json['id'] as String,
      userId: json['userId'] as String?,
      specialty: json['specialty'] as String?,
      user: json['user'] != null
          ? ConversationUser.fromJson(json['user'] as Map<String, dynamic>)
          : null,
    );
  }
}

class ConversationUser {
  final String id;
  final String email;
  final String firstName;
  final String lastName;
  final String role;

  ConversationUser({
    required this.id,
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.role,
  });

  factory ConversationUser.fromJson(Map<String, dynamic> json) {
    return ConversationUser(
      id: json['id'] as String,
      email: json['email'] as String,
      firstName: json['firstName'] as String,
      lastName: json['lastName'] as String,
      role: json['role'] as String,
    );
  }
}
