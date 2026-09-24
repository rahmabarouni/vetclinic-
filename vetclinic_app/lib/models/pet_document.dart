class PetDocument {
  final String id;
  final String fileType;
  final String title;
  final String fileUrl;
  final String createdAt;

  PetDocument({
    required this.id,
    required this.fileType,
    required this.title,
    required this.fileUrl,
    required this.createdAt,
  });

  factory PetDocument.fromJson(Map<String, dynamic> json) {
    return PetDocument(
      id: json['id'] as String,
      fileType: json['fileType'] as String,
      title: json['title'] as String? ?? '',
      fileUrl: json['fileUrl'] as String? ?? '',
      createdAt: json['createdAt'] as String? ?? '',
    );
  }

  String get typeLabel {
    switch (fileType) {
      case 'XRAY':
        return 'Radio';
      case 'LAB_RESULT':
        return 'Analyse';
      case 'PRESCRIPTION':
        return 'Ordonnance';
      case 'PHOTO':
        return 'Photo';
      default:
        return 'Autre';
    }
  }
}