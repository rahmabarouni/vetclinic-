class Pet {
  final String id;
  final String ownerId;
  final String name;
  final String species;
  final String? breed;
  final String? birthDate;
  final String sex;
  final double? weightKg;
  final String? photoUrl;
  final bool isActive;
  final String createdAt;
  final String updatedAt;

  Pet({
    required this.id,
    required this.ownerId,
    required this.name,
    required this.species,
    this.breed,
    this.birthDate,
    required this.sex,
    this.weightKg,
    this.photoUrl,
    required this.isActive,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Pet.fromJson(Map<String, dynamic> json) {
    return Pet(
      id: json['id'] as String,
      ownerId: json['ownerId'] as String? ?? '',
      name: json['name'] as String,
      species: json['species'] as String,
      breed: json['breed'] as String?,
      birthDate: json['birthDate'] as String?,
      sex: json['sex'] as String? ?? 'UNKNOWN',
      weightKg: (json['weightKg'] as num?)?.toDouble(),
      photoUrl: json['photoUrl'] as String?,
      isActive: json['isActive'] as bool? ?? true,
      createdAt: json['createdAt'] as String? ?? '',
      updatedAt: json['updatedAt'] as String? ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'species': species,
      if (breed != null) 'breed': breed,
      'sex': sex,
      if (weightKg != null) 'weightKg': weightKg,
    };
  }

  String get speciesLabel {
    switch (species) {
      case 'DOG':
        return 'Chien';
      case 'CAT':
        return 'Chat';
      case 'BIRD':
        return 'Oiseau';
      case 'RABBIT':
        return 'Lapin';
      case 'RODENT':
        return 'Rongeur';
      case 'REPTILE':
        return 'Reptile';
      default:
        return 'Autre';
    }
  }

  String get sexLabel {
    switch (sex) {
      case 'MALE':
        return 'Mâle';
      case 'FEMALE':
        return 'Femelle';
      default:
        return 'Inconnu';
    }
  }
}
