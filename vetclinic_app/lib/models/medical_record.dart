class MedicalRecord {
  final String id;
  final String petId;
  final String recordType;
  final String title;
  final String? description;
  final String? diagnosis;
  final String createdAt;
  final String? veterinarianName;

  MedicalRecord({
    required this.id,
    required this.petId,
    required this.recordType,
    required this.title,
    this.description,
    this.diagnosis,
    required this.createdAt,
    this.veterinarianName,
  });

  factory MedicalRecord.fromJson(Map<String, dynamic> json) {
    final vet = json['veterinarian'] as Map<String, dynamic>?;
    final vetUser = vet?['user'] as Map<String, dynamic>?;
    return MedicalRecord(
      id: json['id'] as String,
      petId: json['petId'] as String,
      recordType: json['recordType'] as String,
      title: json['title'] as String? ?? '',
      description: json['description'] as String?,
      diagnosis: json['diagnosis'] as String?,
      createdAt: json['createdAt'] as String? ?? '',
      veterinarianName: vetUser == null
          ? null
          : '${vetUser['firstName']} ${vetUser['lastName']}'.trim(),
    );
  }

  String get typeLabel {
    switch (recordType) {
      case 'CONSULTATION':
        return 'Consultation';
      case 'VACCINATION':
        return 'Vaccination';
      case 'SURGERY':
        return 'Chirurgie';
      case 'TREATMENT':
        return 'Traitement';
      case 'ALLERGY':
        return 'Allergie';
      default:
        return 'Autre';
    }
  }
}