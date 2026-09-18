    // ========== PRINTFUL MERCH MANAGER ==========
    let printfulCatalog = [];
    let printfulStoreProducts = [];
    let currentCatalogProduct = null;
    let selectedColors = new Set();
    let selectedSizes = new Set();
    let productVariantsMap = {};

    // ========== MERCH PREFERENCES ==========
    const MERCH_PREFS_KEY = 'merch_manager_preferences';

    function loadMerchPreferences() {
      try {
        const stored = localStorage.getItem(MERCH_PREFS_KEY);
        if (stored) {
          const prefs = JSON.parse(stored);
          if (prefs.defaultPrice !== undefined) {
            document.getElementById('merch-pref-price').value = prefs.defaultPrice;
          }
          if (prefs.priceMarkup !== undefined) {
            document.getElementById('merch-pref-markup').value = prefs.priceMarkup;
          }
          if (prefs.favoriteColors && Array.isArray(prefs.favoriteColors)) {
            document.querySelectorAll('.merch-color-pref input[type="checkbox"]').forEach(cb => {
              cb.checked = prefs.favoriteColors.includes(cb.value);
              updateMerchColorPrefStyle(cb);
            });
          }
        } else {
          document.querySelectorAll('.merch-color-pref input[type="checkbox"]').forEach(cb => {
            updateMerchColorPrefStyle(cb);
          });
        }
      } catch (err) {
        console.error('Error loading merch preferences:', err);
      }
    }
    globalThis.loadMerchPreferences = loadMerchPreferences;

    function saveMerchPreferences() {
      try {
        const prefs = {
          defaultPrice: Number.parseFloat(document.getElementById('merch-pref-price').value) || 29.99,
          priceMarkup: Number.parseInt(document.getElementById('merch-pref-markup').value) || 50,
          favoriteColors: []
        };
        document.querySelectorAll('.merch-color-pref input[type="checkbox"]:checked').forEach(cb => {
          prefs.favoriteColors.push(cb.value);
        });
        localStorage.setItem(MERCH_PREFS_KEY, JSON.stringify(prefs));
        showToast('Preferences saved!', 'success');
      } catch (err) {
        console.error('Error saving merch preferences:', err);
        showToast('Failed to save preferences', 'error');
      }
    }
    globalThis.saveMerchPreferences = saveMerchPreferences;

    function getMerchDefaultPrice() {
      try {
        const stored = localStorage.getItem(MERCH_PREFS_KEY);
        if (stored) {
          const prefs = JSON.parse(stored);
          if (prefs.defaultPrice !== undefined) {
            return prefs.defaultPrice;
          }
        }
      } catch (err) {
        console.error('Error getting merch default price:', err);
      }
      return 29.99;
    }
    globalThis.getMerchDefaultPrice = getMerchDefaultPrice;

    function getMerchDefaultColors() {
      try {
        const stored = localStorage.getItem(MERCH_PREFS_KEY);
        if (stored) {
          const prefs = JSON.parse(stored);
          if (prefs.favoriteColors && Array.isArray(prefs.favoriteColors)) {
            return prefs.favoriteColors;
          }
        }
      } catch (err) {
        console.error('Error getting merch default colors:', err);
      }
      return ['Black', 'White', 'Navy'];
    }
    globalThis.getMerchDefaultColors = getMerchDefaultColors;

    function toggleMerchPreferencesPanel() {
      const panel = document.getElementById('merch-preferences-panel');
      const toggle = document.getElementById('merch-prefs-toggle');
      if (panel.style.display === 'none') {
        panel.style.display = 'block';
        toggle.style.transform = 'rotate(180deg)';
      } else {
        panel.style.display = 'none';
        toggle.style.transform = 'rotate(0deg)';
      }
    }
    globalThis.toggleMerchPreferencesPanel = toggleMerchPreferencesPanel;

    function updateMerchColorPrefStyle(checkbox) {
      const label = checkbox.closest('label');
      if (label) {
        if (checkbox.checked) {
          label.style.borderColor = 'var(--accent-gold)';
          label.style.background = 'var(--accent-gold-soft)';
        } else {
          label.style.borderColor = 'transparent';
          label.style.background = 'var(--bg-input)';
        }
      }
    }

    document.addEventListener('change', (e) => {
      if (e.target.closest('.merch-color-pref')) {
        updateMerchColorPrefStyle(e.target);
      }
    });

    async function getAdminAuthHeader() {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session?.access_token) {
          return { 'Authorization': `Bearer ${session.access_token}` };
        }
      } catch { /* Intentionally silent */ }
      const headers = {};
      if (adminTeamToken && !headers['Authorization']) headers['Authorization'] = 'Bearer ' + adminTeamToken;
      if (!headers['Authorization']) throw new Error('Not authenticated');
      return headers;
    }

    async function loadPrintfulCatalog() {
      const loadingEl = document.getElementById('catalog-loading');
      const emptyEl = document.getElementById('catalog-empty');
      const gridEl = document.getElementById('catalog-grid');
      const filterEl = document.getElementById('catalog-category-filter');
      
      loadingEl.style.display = 'block';
      emptyEl.style.display = 'none';
      gridEl.style.display = 'none';
      
      try {
        const headers = await getAdminAuthHeader();
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/printful/catalog`, { headers });
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to load catalog');
        }
        
        printfulCatalog = data.products;
        
        filterEl.innerHTML = '<option value="all">All Categories</option>';
        (data.categories || []).forEach(cat => {
          filterEl.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
        });
        
        renderCatalog();
      } catch (error) {
        console.error('Error loading catalog:', error);
        showToast('Error loading catalog: ' + error.message, 'error');
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
      }
    }
    globalThis.loadPrintfulCatalog = loadPrintfulCatalog;

    function renderCatalog(filter = 'all') {
      const loadingEl = document.getElementById('catalog-loading');
      const emptyEl = document.getElementById('catalog-empty');
      const gridEl = document.getElementById('catalog-grid');
      
      loadingEl.style.display = 'none';
      
      const filtered = filter === 'all' ? printfulCatalog : printfulCatalog.filter(p => p.category === filter);
      
      if (filtered.length === 0) {
        emptyEl.style.display = 'block';
        gridEl.style.display = 'none';
        return;
      }
      
      emptyEl.style.display = 'none';
      gridEl.style.display = 'grid';
      
      gridEl.innerHTML = filtered.map(product => `
        <div style="background:var(--bg-card);border:1px solid var(--border-light);border-radius:var(--radius-md);overflow:hidden;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;" onclick="openProductCreator(${product.id})" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.3)';" onmouseout="this.style.transform='none';this.style.boxShadow='none';">
          <div style="height:160px;background:var(--bg-input);display:flex;align-items:center;justify-content:center;overflow:hidden;">
            <img src="${product.image}" alt="${product.title}" style="max-width:100%;max-height:100%;object-fit:contain;" loading="lazy">
          </div>
          <div style="padding:14px;">
            <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${product.title}</div>
            <div style="font-size:0.8rem;color:var(--text-muted);">${product.category}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">${product.variantCount} variants</div>
          </div>
        </div>
      `).join('');
    }

    function filterCatalogByCategory() {
      const filter = document.getElementById('catalog-category-filter').value;
      renderCatalog(filter);
    }
    globalThis.filterCatalogByCategory = filterCatalogByCategory;

    async function openProductCreator(catalogProductId) {
      const modal = document.getElementById('product-creator-modal');
      const loadingEl = document.getElementById('product-creator-loading');
      const formEl = document.getElementById('product-creator-form');
      const submitBtn = document.getElementById('product-creator-submit');
      
      modal.style.display = 'flex';
      loadingEl.style.display = 'block';
      formEl.style.display = 'none';
      submitBtn.disabled = true;
      
      selectedColors.clear();
      selectedSizes.clear();
      productVariantsMap = {};
      
      try {
        const headers = await getAdminAuthHeader();
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/printful/catalog/${catalogProductId}`, { headers });
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to load product');
        }
        
        currentCatalogProduct = data.product;
        
        document.getElementById('product-creator-title').textContent = data.product.title;
        document.getElementById('product-creator-image').src = data.product.image;
        document.getElementById('product-creator-name').value = 'MCC ' + data.product.title;
        document.getElementById('product-creator-price').value = getMerchDefaultPrice();
        
        const favoriteColors = getMerchDefaultColors();
        const colorsEl = document.getElementById('product-creator-colors');
        colorsEl.innerHTML = data.product.colors.map(c => {
          const isFavorite = favoriteColors.includes(c.name);
          if (isFavorite) {
            selectedColors.add(c.name);
          }
          return `
          <button type="button" class="color-option" data-color="${c.name}" onclick="toggleColorSelection(this, '${c.name}')" style="padding:8px 14px;border-radius:20px;border:2px solid ${isFavorite ? 'var(--accent-gold)' : 'var(--border-light)'};background:${isFavorite ? 'var(--accent-gold-soft)' : 'var(--bg-input)'};cursor:pointer;display:flex;align-items:center;gap:8px;transition:all 0.15s;">
            <span style="width:16px;height:16px;border-radius:50%;background:${c.code || '#888'};border:1px solid rgba(255,255,255,0.2);"></span>
            <span>${c.name}</span>
          </button>
        `;
        }).join('');
        
        const sizesEl = document.getElementById('product-creator-sizes');
        if (data.product.sizes.length > 0) {
          sizesEl.innerHTML = data.product.sizes.map(s => `
            <button type="button" class="size-option" data-size="${s}" onclick="toggleSizeSelection(this, '${s}')" style="padding:8px 16px;border-radius:8px;border:2px solid var(--border-light);background:var(--bg-input);cursor:pointer;min-width:50px;transition:all 0.15s;">
              ${s}
            </button>
          `).join('');
          sizesEl.parentElement.style.display = 'block';
        } else {
          sizesEl.parentElement.style.display = 'none';
        }
        
        data.product.variants.forEach(v => {
          const key = `${v.color || 'default'}|${v.size || 'default'}`;
          productVariantsMap[key] = v.id;
        });
        
        loadingEl.style.display = 'none';
        formEl.style.display = 'block';
        updateVariantCount();
        renderModalDesignGallery();
      } catch (error) {
        console.error('Error loading product:', error);
        showToast('Error loading product: ' + error.message, 'error');
        closeProductCreatorModal();
      }
    }
    globalThis.openProductCreator = openProductCreator;

    function toggleColorSelection(btn, color) {
      if (selectedColors.has(color)) {
        selectedColors.delete(color);
        btn.style.borderColor = 'var(--border-light)';
        btn.style.background = 'var(--bg-input)';
      } else {
        selectedColors.add(color);
        btn.style.borderColor = 'var(--accent-gold)';
        btn.style.background = 'var(--accent-gold-soft)';
      }
      updateVariantCount();
    }
    globalThis.toggleColorSelection = toggleColorSelection;

    function toggleSizeSelection(btn, size) {
      if (selectedSizes.has(size)) {
        selectedSizes.delete(size);
        btn.style.borderColor = 'var(--border-light)';
        btn.style.background = 'var(--bg-input)';
      } else {
        selectedSizes.add(size);
        btn.style.borderColor = 'var(--accent-gold)';
        btn.style.background = 'var(--accent-gold-soft)';
      }
      updateVariantCount();
    }
    globalThis.toggleSizeSelection = toggleSizeSelection;

    function updateVariantCount() {
      const variantIds = getSelectedVariantIds();
      const infoEl = document.getElementById('product-creator-variants-info');
      const submitBtn = document.getElementById('product-creator-submit');
      
      infoEl.innerHTML = `<span style="font-weight:600;">${variantIds.length}</span> variants selected`;
      submitBtn.disabled = variantIds.length === 0;
    }

    function getSelectedVariantIds() {
      const variantIds = [];
      const colors = selectedColors.size > 0 ? Array.from(selectedColors) : ['default'];
      const sizes = selectedSizes.size > 0 ? Array.from(selectedSizes) : ['default'];
      
      for (const color of colors) {
        for (const size of sizes) {
          const key = `${color}|${size}`;
          if (productVariantsMap[key]) {
            variantIds.push(productVariantsMap[key]);
          }
        }
      }
      
      return variantIds;
    }

    async function submitProductCreation() {
      const submitBtn = document.getElementById('product-creator-submit');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';
      
      try {
        const name = document.getElementById('product-creator-name').value.trim();
        const price = document.getElementById('product-creator-price').value;
        const designUrl = document.getElementById('product-creator-design').value.trim();
        const variantIds = getSelectedVariantIds();
        
        if (!name) {
          throw new Error('Please enter a product name');
        }
        
        if (variantIds.length === 0) {
          throw new Error('Please select at least one color/size combination');
        }
        
        const authHeaders = await getAdminAuthHeader();
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/printful/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            name,
            variantIds,
            retailPrice: price,
            designUrl: designUrl || null,
            designPosition: 'front'
          })
        });
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to create product');
        }
        
        showToast(`Product created with ${data.product.variants} variants!`, 'success');
        closeProductCreatorModal();
        await refreshStoreProducts();
      } catch (error) {
        console.error('Error creating product:', error);
        showToast('Error: ' + error.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
    globalThis.submitProductCreation = submitProductCreation;

    function closeProductCreatorModal() {
      document.getElementById('product-creator-modal').style.display = 'none';
      currentCatalogProduct = null;
      hideMockupPreview();
    }
    globalThis.closeProductCreatorModal = closeProductCreatorModal;

    async function generateMockupPreview() {
      const designUrl = document.getElementById('product-creator-design').value.trim();
      const variantIds = getSelectedVariantIds();
      
      if (!designUrl) {
        showToast('Please enter a design URL first', 'error');
        return;
      }
      
      if (variantIds.length === 0) {
        showToast('Please select at least one color variant', 'error');
        return;
      }
      
      if (!currentCatalogProduct) {
        showToast('Product not loaded', 'error');
        return;
      }
      
      const previewArea = document.getElementById('mockup-preview-area');
      const loadingEl = document.getElementById('mockup-preview-loading');
      const contentEl = document.getElementById('mockup-preview-content');
      const errorEl = document.getElementById('mockup-preview-error');
      const btn = document.getElementById('preview-mockup-btn');
      const btnText = document.getElementById('mockup-btn-text');
      
      previewArea.style.display = 'block';
      loadingEl.style.display = 'block';
      contentEl.style.display = 'none';
      errorEl.style.display = 'none';
      btn.disabled = true;
      btnText.innerHTML = mccIcon('clock', 16) + ' Loading...';
      
      try {
        const authHeaders = await getAdminAuthHeader();
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/printful/mockup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            productId: currentCatalogProduct.id,
            variantIds: [variantIds[0]],
            designUrl: designUrl
          })
        });
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to generate mockup');
        }
        
        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';
        document.getElementById('mockup-preview-image').src = data.mockupUrl;
        
      } catch (error) {
        console.error('Mockup generation error:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        document.getElementById('mockup-error-text').textContent = 'Error: ' + error.message;
      } finally {
        btn.disabled = false;
        btnText.innerHTML = mccIcon('eye', 16) + ' Preview';
      }
    }
    globalThis.generateMockupPreview = generateMockupPreview;
    
    function hideMockupPreview() {
      const previewArea = document.getElementById('mockup-preview-area');
      if (previewArea) {
        previewArea.style.display = 'none';
      }
    }
    globalThis.hideMockupPreview = hideMockupPreview;

    async function refreshStoreProducts() {
      const loadingEl = document.getElementById('store-products-loading');
      const emptyEl = document.getElementById('store-products-empty');
      const gridEl = document.getElementById('store-products-grid');
      
      loadingEl.style.display = 'block';
      emptyEl.style.display = 'none';
      gridEl.innerHTML = '';
      
      try {
        const headers = await getAdminAuthHeader();
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/printful/store-products`, { headers });
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to load store products');
        }
        
        printfulStoreProducts = data.products;
        loadingEl.style.display = 'none';
        
        if (printfulStoreProducts.length === 0) {
          emptyEl.style.display = 'block';
          return;
        }
        
        gridEl.innerHTML = printfulStoreProducts.map(product => `
          <div style="background:var(--bg-card);border:1px solid var(--border-light);border-radius:var(--radius-md);overflow:hidden;position:relative;">
            <div style="height:120px;background:var(--bg-input);display:flex;align-items:center;justify-content:center;overflow:hidden;">
              ${product.thumbnail ? `<img src="${product.thumbnail}" alt="${product.name}" style="max-width:100%;max-height:100%;object-fit:contain;">` : '<div style="font-size:48px;">' + mccIcon('package', 40) + '</div>'}
            </div>
            <div style="padding:12px;">
              <div style="font-weight:600;font-size:0.85rem;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${product.name}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${product.variants} variants</div>
            </div>
            <button onclick="deleteStoreProduct(${product.id}, '${product.name.replaceAll('\'', "\\'")}')" style="position:absolute;top:8px;right:8px;width:28px;height:28px;border-radius:50%;background:rgba(239,95,95,0.9);border:none;color:white;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;">×</button>
          </div>
        `).join('');
      } catch (error) {
        console.error('Error loading store products:', error);
        showToast('Error: ' + error.message, 'error');
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
      }
    }
    globalThis.refreshStoreProducts = refreshStoreProducts;

    async function deleteStoreProduct(productId, productName) {
      if (!confirm(`Delete "${productName}" from your store?`)) {
        return;
      }
      
      try {
        const headers = await getAdminAuthHeader();
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/printful/products/${productId}`, {
          method: 'DELETE',
          headers
        });
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to delete product');
        }
        
        showToast('Product deleted', 'success');
        await refreshStoreProducts();
      } catch (error) {
        console.error('Error deleting product:', error);
        showToast('Error: ' + error.message, 'error');
      }
    }
    globalThis.deleteStoreProduct = deleteStoreProduct;

    // ========== BULK PRODUCT CREATOR ==========
    const BULK_CATEGORY_DEFAULTS = {
      24: { name: 'T-Shirt', productId: 71, defaultColors: ['Black', 'White', 'Navy'], defaultSizes: ['S', 'M', 'L', 'XL'] },
      55: { name: 'Hoodie', productId: 146, defaultColors: ['Black', 'White', 'Navy'], defaultSizes: ['S', 'M', 'L', 'XL'] },
      60: { name: 'Hat', productId: 206, defaultColors: ['Black', 'White', 'Navy'], defaultSizes: [] },
      82: { name: 'Mug', productId: 19, defaultColors: ['White'], defaultSizes: [] },
      57: { name: 'Tank Top', productId: 163, defaultColors: ['Black', 'White'], defaultSizes: ['S', 'M', 'L', 'XL'] },
      26: { name: 'Long Sleeve', productId: 116, defaultColors: ['Black', 'White', 'Navy'], defaultSizes: ['S', 'M', 'L', 'XL'] },
      52: { name: 'Sticker', productId: 358, defaultColors: [], defaultSizes: [] },
      73: { name: 'Phone Case', productId: 274, defaultColors: [], defaultSizes: [] },
      72: { name: 'Bag', productId: 308, defaultColors: ['Black'], defaultSizes: [] }
    };

    function openBulkCreatorModal() {
      const modal = document.getElementById('bulk-product-creator-modal');
      modal.style.display = 'flex';
      
      document.getElementById('bulk-creator-name').value = 'MCC';
      document.getElementById('bulk-creator-price').value = getMerchDefaultPrice();
      document.getElementById('bulk-creator-design').value = '';
      document.getElementById('bulk-creator-progress').style.display = 'none';
      document.getElementById('bulk-creator-submit').disabled = false;
      document.getElementById('bulk-creator-submit').textContent = 'Create Products';
      
      const checkboxes = document.querySelectorAll('.bulk-category-checkbox');
      checkboxes.forEach((cb, idx) => {
        cb.checked = idx < 4;
        updateCategoryLabelStyle(cb);
      });
      
      updateBulkCategoryCount();
      renderBulkModalDesignGallery();
    }
    globalThis.openBulkCreatorModal = openBulkCreatorModal;

    function closeBulkCreatorModal() {
      document.getElementById('bulk-product-creator-modal').style.display = 'none';
    }
    globalThis.closeBulkCreatorModal = closeBulkCreatorModal;

    function toggleAllCategories(checked) {
      const checkboxes = document.querySelectorAll('.bulk-category-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = checked;
        updateCategoryLabelStyle(cb);
      });
      updateBulkCategoryCount();
    }
    globalThis.toggleAllCategories = toggleAllCategories;

    function updateCategoryLabelStyle(checkbox) {
      const label = checkbox.closest('label');
      if (label) {
        if (checkbox.checked) {
          label.style.borderColor = 'var(--accent-gold)';
          label.style.background = 'var(--accent-gold-soft)';
        } else {
          label.style.borderColor = 'transparent';
          label.style.background = 'var(--bg-input)';
        }
      }
    }

    function updateBulkCategoryCount() {
      const checkboxes = document.querySelectorAll('.bulk-category-checkbox:checked');
      const countEl = document.getElementById('bulk-category-count');
      if (countEl) {
        countEl.textContent = checkboxes.length;
      }
    }

    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('bulk-category-checkbox')) {
        updateCategoryLabelStyle(e.target);
        updateBulkCategoryCount();
      }
    });

    function renderBulkModalDesignGallery() {
      const galleryEl = document.getElementById('bulk-modal-design-gallery');
      if (!galleryEl) return;
      
      if (designLibrary.length === 0) {
        galleryEl.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:0.8rem;">No designs uploaded. Upload designs in the Design Library section.</div>';
        return;
      }
      
      galleryEl.innerHTML = designLibrary.map(design => `
        <div onclick="selectBulkDesign('${design.url}')" style="width:60px;height:60px;border-radius:var(--radius-sm);overflow:hidden;cursor:pointer;border:2px solid var(--border-subtle);transition:all 0.15s;background:var(--bg-elevated);" onmouseover="this.style.borderColor='var(--accent-gold)';" onmouseout="if(!this.classList.contains('selected'))this.style.borderColor='var(--border-subtle)';">
          <img src="${design.url}" alt="${design.filename}" style="width:100%;height:100%;object-fit:contain;" loading="lazy">
        </div>
      `).join('');
    }

    function selectBulkDesign(url) {
      document.getElementById('bulk-creator-design').value = url;
      
      const gallery = document.getElementById('bulk-modal-design-gallery');
      if (gallery) {
        gallery.querySelectorAll('div').forEach(div => {
          div.classList.remove('selected');
          div.style.borderColor = 'var(--border-subtle)';
        });
        
        const selected = gallery.querySelector(`div[onclick*="${url}"]`);
        if (selected) {
          selected.classList.add('selected');
          selected.style.borderColor = 'var(--accent-gold)';
        }
      }
    }
    globalThis.selectBulkDesign = selectBulkDesign;

    async function submitBulkCreation() {
      const submitBtn = document.getElementById('bulk-creator-submit');
      const progressEl = document.getElementById('bulk-creator-progress');
      const progressBar = document.getElementById('bulk-progress-bar');
      const progressText = document.getElementById('bulk-progress-text');
      const progressLog = document.getElementById('bulk-progress-log');
      
      const namePrefix = document.getElementById('bulk-creator-name').value.trim();
      const price = document.getElementById('bulk-creator-price').value;
      const designUrl = document.getElementById('bulk-creator-design').value.trim();
      
      if (!namePrefix) {
        showToast('Please enter a product name prefix', 'error');
        return;
      }
      
      const selectedCategories = [];
      document.querySelectorAll('.bulk-category-checkbox:checked').forEach(cb => {
        selectedCategories.push({
          categoryId: Number.parseInt(cb.value),
          categoryName: cb.dataset.categoryName
        });
      });
      
      if (selectedCategories.length === 0) {
        showToast('Please select at least one category', 'error');
        return;
      }
      
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';
      progressEl.style.display = 'block';
      progressBar.style.width = '0%';
      progressText.textContent = `0 / ${selectedCategories.length}`;
      progressLog.innerHTML = '';
      
      const products = [];
      let completed = 0;
      
      for (const cat of selectedCategories) {
        const config = BULK_CATEGORY_DEFAULTS[cat.categoryId];
        if (!config) {
          progressLog.innerHTML += `<div style="color:var(--accent-orange);">${mccIcon('alert-triangle', 16)} Unknown category: ${cat.categoryName}</div>`;
          continue;
        }
        
        progressLog.innerHTML += `<div style="color:var(--text-muted);">${mccIcon('package', 16)} Fetching variants for ${cat.categoryName}...</div>`;
        progressLog.scrollTop = progressLog.scrollHeight;
        
        try {
          const headers = await getAdminAuthHeader();
          const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
          const response = await fetch(`${apiBase}/api/admin/printful/catalog/${config.productId}`, { headers });
          const data = await response.json();
          
          if (!data.success || !data.product) {
            throw new Error(data.error || 'Failed to load product data');
          }
          
          const variantIds = [];
          const variants = data.product.variants || [];
          
          for (const variant of variants) {
            const colorMatch = config.defaultColors.length === 0 || 
                               config.defaultColors.some(c => (variant.color || '').toLowerCase().includes(c.toLowerCase()));
            const sizeMatch = config.defaultSizes.length === 0 || 
                              config.defaultSizes.includes(variant.size);
            
            if (colorMatch && sizeMatch) {
              variantIds.push(variant.id);
            }
          }
          
          if (variantIds.length === 0 && variants.length > 0) {
            variantIds.push(...variants.slice(0, 5).map(v => v.id));
          }
          
          if (variantIds.length > 0) {
            products.push({
              catalogProductId: config.productId,
              productName: `${namePrefix} ${cat.categoryName}`,
              variantIds
            });
            progressLog.innerHTML += `<div style="color:var(--accent-green);">${mccIcon('check', 16)} ${cat.categoryName}: ${variantIds.length} variants</div>`;
          } else {
            progressLog.innerHTML += `<div style="color:var(--accent-orange);">${mccIcon('alert-triangle', 16)} ${cat.categoryName}: No variants found</div>`;
          }
        } catch (error) {
          progressLog.innerHTML += `<div style="color:var(--accent-red);">${mccIcon('x', 16)} ${cat.categoryName}: ${error.message}</div>`;
        }
        
        completed++;
        progressBar.style.width = `${(completed / selectedCategories.length) * 50}%`;
        progressLog.scrollTop = progressLog.scrollHeight;
      }
      
      if (products.length === 0) {
        showToast('No products could be prepared. Check the logs above.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Products';
        return;
      }
      
      progressLog.innerHTML += `<div style="color:var(--text-primary);font-weight:600;margin-top:8px;">Creating ${products.length} products...</div>`;
      progressLog.scrollTop = progressLog.scrollHeight;
      
      try {
        const headers = await getAdminAuthHeader();
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/printful/products/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            name: namePrefix,
            designUrl: designUrl || null,
            retailPrice: price,
            products
          })
        });
        
        const data = await response.json();
        
        progressBar.style.width = '100%';
        
        if (!data.success) {
          throw new Error(data.error || 'Bulk creation failed');
        }
        
        for (const result of data.results) {
          if (result.success) {
            progressLog.innerHTML += `<div style="color:var(--accent-green);">${mccIcon('check', 16)} Created: ${result.product.name} (${result.product.variants} variants)</div>`;
          } else {
            progressLog.innerHTML += `<div style="color:var(--accent-red);">${mccIcon('x', 16)} Failed: ${result.error}</div>`;
          }
        }
        
        progressLog.scrollTop = progressLog.scrollHeight;
        progressText.textContent = `${data.summary.succeeded} / ${data.summary.total} succeeded`;
        
        showToast(`Bulk creation complete: ${data.summary.succeeded} succeeded, ${data.summary.failed} failed`, 
                  data.summary.failed > 0 ? 'warning' : 'success');
        
        await refreshStoreProducts();
        
        submitBtn.textContent = 'Done!';
        setTimeout(() => {
          closeBulkCreatorModal();
        }, 2000);
      } catch (error) {
        console.error('Bulk creation error:', error);
        progressLog.innerHTML += `<div style="color:var(--accent-red);font-weight:600;">${mccIcon('x', 16)} Error: ${error.message}</div>`;
        showToast('Bulk creation failed: ' + error.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Retry';
      }
    }
    globalThis.submitBulkCreation = submitBulkCreation;

    // ========== DESIGN LIBRARY ==========
    let designLibrary = [];

    async function loadDesignLibrary() {
      const loadingEl = document.getElementById('design-library-loading');
      const emptyEl = document.getElementById('design-library-empty');
      const gridEl = document.getElementById('design-library-grid');
      
      if (!loadingEl || !emptyEl || !gridEl) return;
      
      loadingEl.style.display = 'block';
      emptyEl.style.display = 'none';
      gridEl.style.display = 'none';
      
      try {
        const headers = await getAdminAuthHeader();
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/designs`, { headers });
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to load designs');
        }
        
        designLibrary = data.designs || [];
        loadingEl.style.display = 'none';
        
        if (designLibrary.length === 0) {
          emptyEl.style.display = 'block';
          return;
        }
        
        emptyEl.style.display = 'none';
        gridEl.style.display = 'grid';
        renderDesignLibrary();
      } catch (error) {
        console.error('Error loading designs:', error);
        showToast('Error loading designs: ' + error.message, 'error');
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
      }
    }
    globalThis.loadDesignLibrary = loadDesignLibrary;

    function renderDesignLibrary() {
      const gridEl = document.getElementById('design-library-grid');
      if (!gridEl) return;
      
      gridEl.innerHTML = designLibrary.map(design => `
        <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);overflow:hidden;position:relative;">
          <div style="height:100px;background:var(--bg-input);display:flex;align-items:center;justify-content:center;overflow:hidden;padding:8px;">
            <img src="${design.url}" alt="${design.filename}" style="max-width:100%;max-height:100%;object-fit:contain;" loading="lazy">
          </div>
          <div style="padding:10px;">
            <div style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:8px;" title="${design.filename}">${design.filename}</div>
            <div style="display:flex;gap:6px;">
              <button onclick="copyDesignUrl('${design.url}')" style="flex:1;padding:6px;border:none;border-radius:var(--radius-sm);background:var(--accent-blue-soft);color:var(--accent-blue);cursor:pointer;font-size:0.72rem;">${mccIcon('clipboard-list', 16)} Copy URL</button>
              <button onclick="deleteDesign('${encodeURIComponent(design.filename)}')" style="padding:6px 8px;border:none;border-radius:var(--radius-sm);background:var(--accent-red-soft);color:var(--accent-red);cursor:pointer;font-size:0.72rem;">${mccIcon('x', 16)}</button>
            </div>
          </div>
        </div>
      `).join('');
    }

    async function uploadDesign(file) {
      if (!file) return;
      
      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
      if (!allowedTypes.includes(file.type)) {
        showToast('Invalid file type. Use PNG, JPEG, WebP, or SVG.', 'error');
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) {
        showToast('File too large. Max size is 10MB.', 'error');
        return;
      }
      
      showToast('Uploading design...', 'info');
      
      try {
        const headers = await getAdminAuthHeader();
        const formData = new FormData();
        formData.append('file', file);
        
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/designs/upload`, {
          method: 'POST',
          headers: headers,
          body: formData
        });
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Upload failed');
        }
        
        showToast('Design uploaded successfully!', 'success');
        await loadDesignLibrary();
      } catch (error) {
        console.error('Upload error:', error);
        showToast('Upload failed: ' + error.message, 'error');
      }
    }
    globalThis.uploadDesign = uploadDesign;

    async function deleteDesign(encodedFilename) {
      const filename = decodeURIComponent(encodedFilename);
      if (!confirm(`Delete design "${filename}"?`)) return;
      
      try {
        const headers = await getAdminAuthHeader();
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/designs/${encodedFilename}`, {
          method: 'DELETE',
          headers
        });
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Delete failed');
        }
        
        showToast('Design deleted', 'success');
        await loadDesignLibrary();
      } catch (error) {
        console.error('Delete error:', error);
        showToast('Delete failed: ' + error.message, 'error');
      }
    }
    globalThis.deleteDesign = deleteDesign;

    function copyDesignUrl(url) {
      navigator.clipboard.writeText(url).then(() => {
        showToast('URL copied to clipboard!', 'success');
      }).catch(err => {
        console.error('Copy failed:', err);
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('URL copied to clipboard!', 'success');
      });
    }
    globalThis.copyDesignUrl = copyDesignUrl;

    function triggerDesignUpload() {
      document.getElementById('design-upload-input').click();
    }
    globalThis.triggerDesignUpload = triggerDesignUpload;

    function handleDesignFileSelect(event) {
      const file = event.target.files[0];
      if (file) {
        uploadDesign(file);
      }
      event.target.value = '';
    }
    globalThis.handleDesignFileSelect = handleDesignFileSelect;

    function handleDesignDragOver(event) {
      event.preventDefault();
      event.stopPropagation();
      const dropZone = document.getElementById('design-drop-zone');
      if (dropZone) {
        dropZone.style.borderColor = 'var(--accent-gold)';
        dropZone.style.background = 'var(--accent-gold-soft)';
      }
    }
    globalThis.handleDesignDragOver = handleDesignDragOver;

    function handleDesignDragLeave(event) {
      event.preventDefault();
      event.stopPropagation();
      const dropZone = document.getElementById('design-drop-zone');
      if (dropZone) {
        dropZone.style.borderColor = 'var(--border-subtle)';
        dropZone.style.background = 'transparent';
      }
    }
    globalThis.handleDesignDragLeave = handleDesignDragLeave;

    function handleDesignDrop(event) {
      event.preventDefault();
      event.stopPropagation();
      const dropZone = document.getElementById('design-drop-zone');
      if (dropZone) {
        dropZone.style.borderColor = 'var(--border-subtle)';
        dropZone.style.background = 'transparent';
      }
      
      const files = event.dataTransfer.files;
      if (files.length > 0) {
        uploadDesign(files[0]);
      }
    }
    globalThis.handleDesignDrop = handleDesignDrop;

    function selectDesignForProduct(url) {
      const designInput = document.getElementById('product-creator-design');
      if (designInput) {
        designInput.value = url;
        showToast('Design selected', 'success');
      }
    }
    globalThis.selectDesignForProduct = selectDesignForProduct;

    function renderModalDesignGallery() {
      const galleryEl = document.getElementById('modal-design-gallery');
      if (!galleryEl) return;
      
      if (designLibrary.length === 0) {
        galleryEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;margin:0;">No designs uploaded yet. Upload designs in the Design Library above.</p>';
        return;
      }
      
      galleryEl.innerHTML = designLibrary.map(design => `
        <div onclick="selectDesignForProduct('${design.url}')" style="width:60px;height:60px;border:2px solid var(--border-subtle);border-radius:var(--radius-sm);overflow:hidden;cursor:pointer;transition:all 0.15s;flex-shrink:0;" onmouseover="this.style.borderColor='var(--accent-gold)'" onmouseout="this.style.borderColor='var(--border-subtle)'">
          <img src="${design.url}" alt="${design.filename}" style="width:100%;height:100%;object-fit:contain;" loading="lazy">
        </div>
      `).join('');
    }
    globalThis.renderModalDesignGallery = renderModalDesignGallery;

    async function loadChatInsights() {
      try {
        const data = await aiOpsFetch('/api/admin/chat-insights', { headers: getAdminHeaders() });

        document.getElementById('chat-stat-total-sessions').textContent = data.totalSessions || 0;
        document.getElementById('chat-stat-total-messages').textContent = data.totalMessages || 0;
        document.getElementById('chat-stat-thumbs-up').textContent = data.thumbsUp || 0;
        document.getElementById('chat-stat-thumbs-down').textContent = data.thumbsDown || 0;
        document.getElementById('chat-mode-driver').textContent = data.modeCount?.driver || 0;
        document.getElementById('chat-mode-provider').textContent = data.modeCount?.provider || 0;
        document.getElementById('chat-mode-education').textContent = data.modeCount?.education || 0;
        
        const activityEl = document.getElementById('chat-recent-activity');
        if (data.recentActivity && data.recentActivity.length > 0) {
          activityEl.innerHTML = data.recentActivity.map(a => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid var(--border-subtle);">
              <div>
                <span style="color:var(--text-primary);font-weight:500;">${escapeHtml(a.mode)} session</span>
                <span style="color:var(--text-muted);font-size:0.85rem;margin-left:8px;">${a.messageCount} messages</span>
              </div>
              <div style="color:var(--text-secondary);font-size:0.85rem;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(a.lastMessage)}</div>
            </div>
          `).join('');
        } else {
          activityEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">No chat activity yet. Sessions appear here once users interact with the AI assistant.</p>';
        }
        
        const feedbackEl = document.getElementById('chat-feedback-list');
        feedbackEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Feedback is stored locally on each user\'s device. Aggregate feedback tracking will be available in a future update.</p>';
        
      } catch (err) {
        console.error('Failed to load chat insights:', err);
        if (isAdminAuthError(err)) {
          renderAdminAuthErrorInto(document.getElementById('chat-recent-activity'), err, loadChatInsights);
        }
      }
    }

