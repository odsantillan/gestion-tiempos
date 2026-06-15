import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Ingreso } from './ingreso';

describe('Ingreso', () => {
  let component: Ingreso;
  let fixture: ComponentFixture<Ingreso>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Ingreso],
    }).compileComponents();

    fixture = TestBed.createComponent(Ingreso);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
