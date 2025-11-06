import { nanoid } from 'nanoid';
import { dataStore, type CategoryRecord } from '../../data/data-store.js';

interface UpsertCategoryInput {
  slug: string;
  translations: Record<string, { title: string; description?: string }>;
  position?: number;
  isActive?: boolean;
  parentId?: string;
}

export class CategoryService {
  async list(): Promise<CategoryRecord[]> {
    const data = await dataStore.getData();
    return data.categories.sort((a, b) => a.position - b.position);
  }

  async create(input: UpsertCategoryInput): Promise<CategoryRecord> {
    const now = new Date().toISOString();
    const category: CategoryRecord = {
      id: nanoid(),
      parentId: input.parentId,
      slug: input.slug,
      translations: input.translations,
      position: input.position ?? 0,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now
    };

    await dataStore.update((state) => {
      state.categories.push(category);
    });
    return category;
  }

  async update(id: string, input: Partial<UpsertCategoryInput>): Promise<CategoryRecord> {
    let updatedCategory: CategoryRecord | undefined;
    await dataStore.update((state) => {
      const idx = state.categories.findIndex((c) => c.id === id);
      if (idx === -1) {
        throw new Error('Category not found');
      }
      const existing = state.categories[idx];
      updatedCategory = {
        ...existing,
        ...('slug' in input ? { slug: input.slug ?? existing.slug } : {}),
        ...('translations' in input ? { translations: input.translations ?? existing.translations } : {}),
        ...('position' in input ? { position: input.position ?? existing.position } : {}),
        ...('isActive' in input ? { isActive: input.isActive ?? existing.isActive } : {}),
        ...('parentId' in input ? { parentId: input.parentId } : {}),
        updatedAt: new Date().toISOString()
      } satisfies CategoryRecord;
      state.categories[idx] = updatedCategory;
    });

    if (!updatedCategory) {
      throw new Error('Category not found');
    }
    return updatedCategory;
  }

  async hierarchy(): Promise<unknown[]> {
    const categories = await this.list();
    const map = new Map<string, CategoryRecord & { children: CategoryRecord[] }>();
    const roots: (CategoryRecord & { children: CategoryRecord[] })[] = [];

    for (const category of categories) {
      map.set(category.id, { ...category, children: [] });
    }
    for (const category of map.values()) {
      if (category.parentId) {
        const parent = map.get(category.parentId);
        if (parent) {
          parent.children.push(category);
        }
      } else {
        roots.push(category);
      }
    }
    return roots;
  }
}

export const categoryService = new CategoryService();
