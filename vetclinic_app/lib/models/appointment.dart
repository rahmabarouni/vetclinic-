class Appointment {
  final String id;
  final String petId;
  final String clientId;
  final String? veterinarianId;
  final String appointmentType;
  final String status;
  final String scheduledStart;
  final String scheduledEnd;
  final String? reason;
  final String? cancellationReason;
  final String createdAt;
  final String updatedAt;
  final AppointmentPet? pet;
  final AppointmentClient? client;

  Appointment({
    required this.id,
    required this.petId,
    required this.clientId,
    this.veterinarianId,
    required this.appointmentType,
    required this.status,
    required this.scheduledStart,
    required this.scheduledEnd,
    this.reason,
    this.cancellationReason,
    required this.createdAt,
    required this.updatedAt,
    this.pet,
    this.client,
  });

  factory Appointment.fromJson(Map<String, dynamic> json) {
    return Appointment(
      id: json['id'] as String,
      petId: json['petId'] as String,
      clientId: json['clientId'] as String,
      veterinarianId: json['veterinarianId'] as String?,
      appointmentType: json['appointmentType'] as String,
      status: json['status'] as String,
      scheduledStart: json['scheduledStart'] as String,
      scheduledEnd: json['scheduledEnd'] as String,
      reason: json['reason'] as String?,
      cancellationReason: json['cancellationReason'] as String?,
      createdAt: json['createdAt'] as String? ?? '',
      updatedAt: json['updatedAt'] as String? ?? '',
      pet: json['pet'] != null
          ? AppointmentPet.fromJson(json['pet'] as Map<String, dynamic>)
          : null,
      client: json['client'] != null
          ? AppointmentClient.fromJson(json['client'] as Map<String, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'petId': petId,
      'veterinarianId': veterinarianId,
      'appointmentType': appointmentType,
      'scheduledStart': scheduledStart,
      'scheduledEnd': scheduledEnd,
      if (reason != null) 'reason': reason,
    };
  }

  String get typeLabel {
    switch (appointmentType) {
      case 'CONSULTATION':
        return 'Consultation';
      case 'VACCINATION':
        return 'Vaccination';
      case 'SURGERY':
        return 'Chirurgie';
      case 'EMERGENCY':
        return 'Urgence';
      case 'CHECKUP':
        return 'Contrôle';
      case 'GROOMING':
        return 'Toilettage';
      default:
        return 'Autre';
    }
  }

  String get statusLabel {
    switch (status) {
      case 'PENDING':
        return 'En attente';
      case 'CONFIRMED':
        return 'Confirmé';
      case 'CANCELLED':
        return 'Annulé';
      case 'COMPLETED':
        return 'Terminé';
      case 'NO_SHOW':
        return 'Absent';
      default:
        return status;
    }
  }
}

class AppointmentPet {
  final String name;
  final String species;

  AppointmentPet({required this.name, required this.species});

  factory AppointmentPet.fromJson(Map<String, dynamic> json) {
    return AppointmentPet(
      name: json['name'] as String,
      species: json['species'] as String,
    );
  }
}

class AppointmentClient {
  final String firstName;
  final String lastName;

  AppointmentClient({required this.firstName, required this.lastName});

  factory AppointmentClient.fromJson(Map<String, dynamic> json) {
    return AppointmentClient(
      firstName: json['firstName'] as String,
      lastName: json['lastName'] as String,
    );
  }
}
