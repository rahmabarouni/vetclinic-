import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/medical_record.dart';
import '../models/pet.dart';
import '../models/pet_document.dart';
import '../providers/auth_provider.dart';
import '../theme/app_theme.dart';
import '../utils/date_utils.dart';
import '../widgets/pet_species_image.dart';

class PetDetailScreen extends ConsumerStatefulWidget {
  final Pet pet;
  const PetDetailScreen({super.key, required this.pet});

  @override
  ConsumerState<PetDetailScreen> createState() => _PetDetailScreenState();
}

class _PetDetailScreenState extends ConsumerState<PetDetailScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  List<MedicalRecord> _records = [];
  bool _loadingRecords = true;
  String? _recordsError;

  List<PetDocument> _documents = [];
  bool _loadingDocuments = true;
  String? _documentsError;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    Future.microtask(_load);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final api = ref.read(apiServiceProvider);
    try {
      final data = await api.getMedicalRecords(widget.pet.id);
      final items = data['medicalRecords'] as List<dynamic>? ?? [];
      if (!mounted) return;
      setState(() {
        _records = items
            .map((j) => MedicalRecord.fromJson(j as Map<String, dynamic>))
            .toList();
        _loadingRecords = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _recordsError = e.toString();
        _loadingRecords = false;
      });
    }

    if (!mounted) return;
    try {
      final data = await api.getPetDocuments(widget.pet.id);
      final items = data['documents'] as List<dynamic>? ?? [];
      if (!mounted) return;
      setState(() {
        _documents = items
            .map((j) => PetDocument.fromJson(j as Map<String, dynamic>))
            .toList();
        _loadingDocuments = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _documentsError = e.toString();
        _loadingDocuments = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final pet = widget.pet;

    return Scaffold(
      appBar: AppBar(title: Text(pet.name)),
      body: Column(
        children: [
          _PetBanner(pet: pet),
          Material(
            color: AppColors.card,
            child: TabBar(
              controller: _tabController,
              labelColor: AppColors.primary,
              unselectedLabelColor: Colors.grey.shade600,
              indicatorColor: AppColors.primary,
              tabs: const [
                Tab(text: 'Infos'),
                Tab(text: 'Historique'),
                Tab(text: 'Documents'),
              ],
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _InfoTab(pet: pet),
                _HistoryTab(
                  records: _records,
                  loading: _loadingRecords,
                  error: _recordsError,
                ),
                _DocumentsTab(
                  documents: _documents,
                  loading: _loadingDocuments,
                  error: _documentsError,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PetBanner extends StatelessWidget {
  final Pet pet;
  const _PetBanner({required this.pet});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.primary, AppColors.primaryDark],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(24)),
      ),
      child: Column(
        children: [
          ClipOval(
            child: pet.photoUrl != null && pet.photoUrl!.isNotEmpty
                ? Image.network(
                    pet.photoUrl!,
                    width: 80,
                    height: 80,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => CircleAvatar(
                      radius: 40,
                      backgroundColor: Colors.white,
                      child: PetSpeciesImage(species: pet.species, size: 56),
                    ),
                  )
                : CircleAvatar(
                    radius: 40,
                    backgroundColor: Colors.white,
                    child: PetSpeciesImage(species: pet.species, size: 56),
                  ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: [
              _BadgeChip(label: pet.speciesLabel),
              _BadgeChip(label: pet.sexLabel),
              if (pet.weightKg != null) _BadgeChip(label: '${pet.weightKg} kg'),
            ],
          ),
        ],
      ),
    );
  }
}

class _BadgeChip extends StatelessWidget {
  final String label;
  const _BadgeChip({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white24,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
      ),
    );
  }
}

class _InfoTab extends StatelessWidget {
  final Pet pet;
  const _InfoTab({required this.pet});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    PetSpeciesImage(species: pet.species, size: 24),
                    const SizedBox(width: 8),
                    Text(
                      pet.name,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
                const Divider(height: 24),
                _infoRow('Espèce', pet.speciesLabel),
                if (pet.breed != null && pet.breed!.isNotEmpty) _infoRow('Race', pet.breed!),
                _infoRow('Sexe', pet.sexLabel),
                if (pet.weightKg != null) _infoRow('Poids', '${pet.weightKg} kg'),
                if (pet.birthDate != null && pet.birthDate!.isNotEmpty)
                  _infoRow('Date de naissance', formatDateShort(pet.birthDate!)),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(label, style: TextStyle(color: Colors.grey.shade600, fontWeight: FontWeight.w500)),
          ),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}

class _HistoryTab extends StatelessWidget {
  final List<MedicalRecord> records;
  final bool loading;
  final String? error;
  const _HistoryTab({required this.records, required this.loading, this.error});

  IconData _iconFor(String type) {
    switch (type) {
      case 'VACCINATION':
        return Icons.vaccines_outlined;
      case 'SURGERY':
        return Icons.content_cut_outlined;
      case 'TREATMENT':
        return Icons.healing_outlined;
      case 'ALLERGY':
        return Icons.warning_amber_outlined;
      case 'CONSULTATION':
        return Icons.medical_services_outlined;
      default:
        return Icons.description_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: AppColors.error),
              const SizedBox(height: 16),
              const Text("Impossible de charger l'historique médical"),
              const SizedBox(height: 4),
              Text(error!, style: const TextStyle(fontSize: 12, color: Colors.grey)),
            ],
          ),
        ),
      );
    }
    if (records.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.folder_open, size: 56, color: Colors.grey),
            SizedBox(height: 12),
            Text('Aucun dossier médical', style: TextStyle(fontSize: 16, color: Colors.grey)),
            SizedBox(height: 4),
            Text("Les notes du vétérinaire apparaîtront ici", style: TextStyle(color: Colors.grey)),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: records.length,
      itemBuilder: (context, index) {
        final record = records[index];
        return Card(
          margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 0),
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: AppColors.primaryLight,
              child: Icon(_iconFor(record.recordType), color: AppColors.primary),
            ),
            title: Text(record.title, style: const TextStyle(fontWeight: FontWeight.bold)),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(record.typeLabel),
                Text(formatDate(record.createdAt)),
                if (record.description != null && record.description!.isNotEmpty)
                  Text(record.description!, style: const TextStyle(fontSize: 12)),
                if (record.diagnosis != null && record.diagnosis!.isNotEmpty)
                  Text('Diagnostic: ${record.diagnosis}', style: const TextStyle(fontSize: 12)),
                if (record.veterinarianName != null && record.veterinarianName!.isNotEmpty)
                  Text('Dr ${record.veterinarianName}', style: const TextStyle(fontSize: 12)),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _DocumentsTab extends StatelessWidget {
  final List<PetDocument> documents;
  final bool loading;
  final String? error;
  const _DocumentsTab({required this.documents, required this.loading, this.error});

  IconData _iconFor(String type) {
    switch (type) {
      case 'XRAY':
        return Icons.image_outlined;
      case 'LAB_RESULT':
        return Icons.science_outlined;
      case 'PRESCRIPTION':
        return Icons.medication_outlined;
      case 'PHOTO':
        return Icons.photo_outlined;
      default:
        return Icons.description_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: AppColors.error),
              const SizedBox(height: 16),
              const Text('Impossible de charger les documents'),
            ],
          ),
        ),
      );
    }
    if (documents.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.folder_off_outlined, size: 56, color: Colors.grey),
            SizedBox(height: 12),
            Text('Aucun document', style: TextStyle(fontSize: 16, color: Colors.grey)),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: documents.length,
      itemBuilder: (context, index) {
        final document = documents[index];
        return Card(
          margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 0),
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: AppColors.primaryLight,
              child: Icon(_iconFor(document.fileType), color: AppColors.primary),
            ),
            title: Text(document.title, style: const TextStyle(fontWeight: FontWeight.bold)),
            subtitle: Text('${document.typeLabel} · ${formatDate(document.createdAt)}'),
            trailing: const Icon(Icons.download_outlined),
          ),
        );
      },
    );
  }
}