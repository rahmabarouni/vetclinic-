class Veterinarian {
  final String id;
  final String? userId;
  final String specialty;
  final String? bio;
  final bool isAvailableForBooking;
  final VeterinarianUser? user;

  Veterinarian({
    required this.id,
    this.userId,
    this.specialty = '',
    this.bio,
    this.isAvailableForBooking = true,
    this.user,
  });

  factory Veterinarian.fromJson(Map<String, dynamic> json) {
    return Veterinarian(
      id: json['id'] as String,
      userId: json['userId'] as String?,
      specialty: json['specialty'] as String? ?? '',
      bio: json['bio'] as String?,
      isAvailableForBooking: json['isAvailableForBooking'] as bool? ?? true,
      user: json['user'] != null
          ? VeterinarianUser.fromJson(json['user'] as Map<String, dynamic>)
          : null,
    );
  }

  String get displayName {
    if (user != null) {
      return '${user!.firstName} ${user!.lastName}';
    }
    return 'Vétérinaire';
  }
}

class VeterinarianUser {
  final String id;
  final String email;
  final String firstName;
  final String lastName;
  final String role;

  VeterinarianUser({
    required this.id,
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.role,
  });

  factory VeterinarianUser.fromJson(Map<String, dynamic> json) {
    return VeterinarianUser(
      id: json['id'] as String,
      email: json['email'] as String,
      firstName: json['firstName'] as String,
      lastName: json['lastName'] as String,
      role: json['role'] as String? ?? 'VETERINARIAN',
    );
  }
}